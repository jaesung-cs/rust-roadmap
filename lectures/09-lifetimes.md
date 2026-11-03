---
title: 라이프타임
order: 9
minutes: 40
---

3장에서 "참조는 원본보다 오래 살 수 없다"는 규칙을 봤다. 컴파일러는 이를 검사하려고 모든 참조에 **라이프타임(lifetime)**, 즉 "이 참조가 유효한 코드 구간"을 붙인다.
대부분은 자동으로 추론되지만, 함수가 여러 참조를 받아 참조를 반환하거나 구조체가 참조를 품을 때는 **관계를 명시**해야 한다. 이 장은 그 문법과 사고방식을 다룬다.

핵심은 하나다. **라이프타임 표기는 값이 얼마나 오래 사는지를 바꾸지 않는다.** 참조들 사이의 관계를 컴파일러에게 **설명**할 뿐이다.

## 왜 표기가 필요한가

```rust
fn longest(x: &str, y: &str) -> &str {     // error[E0106]: missing lifetime specifier
    if x.len() > y.len() { x } else { y }
}
```

반환값이 `x`를 빌린 것인지 `y`를 빌린 것인지 시그니처만으로는 알 수 없다. 호출 측에서 반환값을 얼마나 오래 써도 되는지 판단하려면 이 정보가 필요하다.
Rust는 함수 **본문이 아니라 시그니처만 보고** 호출 측을 검사하므로(그래야 본문을 바꿔도 호출자가 깨지지 않는다), 관계를 시그니처에 적어야 한다.

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

읽는 법: "어떤 구간 `'a`에 대해, `x`와 `y`가 모두 `'a` 동안 유효하면, 반환값도 `'a` 동안 유효하다." 실제로 `'a`는 두 인자의 유효 구간 중 **짧은 쪽**으로 정해진다.

```rust
fn main() {
    let s1 = String::from("long string");
    let result;
    {
        let s2 = String::from("xyz");
        result = longest(s1.as_str(), s2.as_str()); // error[E0597]: `s2` does not live long enough
    }
    println!("{result}");                            // s2가 죽은 뒤 result 사용
}
```

`result`가 `s1`을 가리키게 될 것을 사람은 알지만, 컴파일러는 시그니처만 믿는다. 시그니처가 "둘 중 하나"라고 했으므로 둘 다 충분히 살아 있어야 한다.

반환값이 한쪽 인자에만 묶여 있다면 그렇게 적는다.

```rust
fn first<'a, 'b>(x: &'a str, _y: &'b str) -> &'a str {
    x                                       // y와는 무관함을 시그니처로 표현
}
```

> [!cpp] **C++ 비교**
>
> C++에도 같은 문제가 있지만 언어가 표현할 방법이 없다. 아래 코드는 컴파일되고 UB다.
>
> ```cpp
> const std::string& longest(const std::string& a, const std::string& b) {
>     return a.size() > b.size() ? a : b;
> }
> auto& r = longest("hello", std::string("world!")); // 임시 객체를 가리키는 참조
> std::cout << r;                                     // UB
> ```
>
> Clang의 `[[clang::lifetimebound]]` 속성이 비슷한 일을 부분적으로 한다. Rust는 이것을 언어 차원에서 강제한다.

## 생략 규칙

그동안 `fn first_word(s: &str) -> &str`처럼 표기 없이 썼던 것은 **라이프타임 생략(elision) 규칙** 덕분이다.

1. 각 참조 인자는 각자 다른 라이프타임을 받는다.
2. 참조 인자가 **하나**뿐이면, 그 라이프타임이 모든 반환 참조에 적용된다.
3. 메서드에서 `&self`나 `&mut self`가 있으면, **`self`의 라이프타임**이 반환 참조에 적용된다.

```text
fn first_word(s: &str) -> &str                   // 규칙 2 → fn first_word<'a>(s: &'a str) -> &'a str
fn get(&self, key: &str) -> Option<&String>      // 규칙 3 → 반환값은 self에 묶임
fn longest(x: &str, y: &str) -> &str             // 규칙으로 정할 수 없음 → 명시 필요
```

규칙으로 결정되지 않으면 그때만 직접 쓰면 된다. 실제 코드에서 라이프타임을 쓰는 빈도는 생각보다 낮다.

## 구조체 안의 참조

구조체가 참조를 필드로 가지려면 라이프타임 파라미터가 필요하다. "이 구조체는 `'a`보다 오래 살 수 없다"는 뜻이다.

```rust
struct Tokenizer<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> Tokenizer<'a> {
    fn new(src: &'a str) -> Self {
        Self { src, pos: 0 }
    }

    // 반환 타입이 &'a str: 토큰은 self가 아니라 원본 문자열을 빌린다
    fn next_token(&mut self) -> Option<&'a str> {
        let src: &'a str = self.src;           // &'a str 복사 (self와 무관한 참조)
        let rest = src[self.pos..].trim_start();
        if rest.is_empty() {
            return None;
        }
        let start = src.len() - rest.len();
        let end = rest.find(char::is_whitespace).map_or(src.len(), |i| start + i);
        self.pos = end;
        Some(&src[start..end])
    }
}

fn main() {
    let text = String::from("let x = 42");
    let mut t = Tokenizer::new(&text);
    let a = t.next_token();
    let b = t.next_token();              // a를 쥔 채로 t를 다시 가변 빌림: OK
    println!("{a:?} {b:?}");             // Some("let") Some("x")
}
```

> [!tip] **팁**
>
> 반환 타입을 `Option<&str>`로 생략했다면 규칙 3에 따라 `&mut self`에 묶인다. 그러면 `a`가 살아 있는 동안 `t`가 계속 가변 빌림 상태가 되어, 두 번째 `next_token` 호출이 E0499로 실패한다.
> **반환값이 실제로 무엇을 빌리는지** 정확히 적는 것이 라이프타임 표기의 진짜 용도다.

참조를 품은 구조체는 원본보다 오래 살 수 없으므로, 주로 **짧게 쓰고 버리는 뷰/파서/반복자**에 쓴다. 오래 보관할 데이터라면 `String`, `Vec<T>`처럼 **소유하는 타입**을 필드로 두는 게 거의 항상 낫다.

> [!warn] **주의**
>
> 자기 자신의 필드를 가리키는 구조체(self-referential struct)는 safe Rust로 만들 수 없다. `struct S { data: String, view: &str }`에서 `view`가 `data`를 가리키게 하는 것은 불가능하다. 이동하면 주소가 바뀌기 때문이다(2장). 오프셋(인덱스)을 저장하거나 데이터를 분리하자.

## 'static

`'static`은 "프로그램 끝까지 유효"라는 뜻이다.

```rust
let s: &'static str = "hello";            // 문자열 리터럴은 바이너리에 박혀 있다
static GREETING: &str = "hi";
```

바운드로 쓸 때는 의미가 조금 다르다. `T: 'static`은 "`T`가 **짧은 참조를 품고 있지 않다**"는 뜻이지, `T`가 영원히 산다는 뜻이 아니다. `String`, `Vec<i32>`처럼 소유하는 타입은 모두 `'static`을 만족한다.

```rust
fn spawn_task<T: Send + 'static>(value: T) { /* 다른 스레드로 넘길 수 있음 */ }

let owned = String::from("ok");
spawn_task(owned);                         // OK: String은 'static
let local = String::from("no");
// spawn_task(&local);                     // error[E0597]: `local` does not live long enough
```

`std::thread::spawn`이 `'static`을 요구하는 이유가 이것이다. 새 스레드가 현재 함수보다 오래 살 수 있으므로 지역 변수를 빌려 가면 안 된다(12장에서 `thread::scope`로 해결한다).

## 그 밖의 문법

```rust
// 라이프타임 바운드: T 안의 참조가 'a 이상 유효
struct Holder<'a, T: 'a> {
    item: &'a T,
}

// 'b가 'a보다 길거나 같다 ('b outlives 'a)
fn pick<'a, 'b: 'a>(x: &'a str, _y: &'b str) -> &'a str { x }

// 익명 라이프타임: "여기 라이프타임이 있다"고만 표시
impl std::fmt::Display for Tokenizer<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Tokenizer at {}", self.pos)
    }
}
```

`'_`는 "추론해라"라는 뜻이다. `Formatter<'_>`처럼 라이프타임이 있는 타입을 쓰되 이름을 붙일 필요가 없을 때 쓴다.

## 흔한 컴파일 에러

| 코드 | 메시지 | 흔한 원인 | 해결 |
|---|---|---|---|
| E0106 | missing lifetime specifier | 참조 인자가 여럿인데 참조 반환 | 관계를 `'a`로 명시 |
| E0597 | does not live long enough | 원본이 먼저 drop됨 | 원본을 더 바깥 스코프로, 또는 소유 타입 사용 |
| E0515 | cannot return reference to local variable | 지역 변수 참조 반환 | 값(`String`) 반환 |
| E0716 | temporary value dropped while borrowed | 임시 값을 빌린 채 문장이 끝남 | 임시 값을 `let`에 바인딩 |
| E0499 | cannot borrow as mutable more than once | 반환값이 `&mut self`에 묶임 | 반환 라이프타임을 원본 데이터에 묶기 |
| — | lifetime may not live long enough | 시그니처와 본문의 관계가 다름 | 시그니처의 관계를 고치기 |

```rust
let words: Vec<&str> = String::from("a b c").split(' ').collect();
// error[E0716]: temporary value dropped while borrowed
println!("{words:?}");

// 해결: 원본을 변수에 바인딩해 살려 둔다
let line = String::from("a b c");
let words: Vec<&str> = line.split(' ').collect();
println!("{words:?}");
```

## 정리

- 라이프타임은 참조가 유효한 구간이다. 표기는 수명을 바꾸지 않고 **관계를 설명**한다.
- 컴파일러는 시그니처만 보고 호출 측을 검사한다. 그래서 반환 참조가 무엇에서 왔는지 시그니처에 적는다.
- 생략 규칙(인자 하나, `&self`) 덕분에 대부분은 표기가 필요 없다.
- 참조를 품은 구조체는 짧은 뷰에 쓰고, 오래 보관할 데이터는 소유 타입으로 둔다.
- `T: 'static`은 "짧은 참조를 품지 않는다"는 뜻이다. 소유 타입은 모두 만족한다.

## 연습문제

1. 두 슬라이스 중 첫 원소가 더 큰 쪽을 반환하는 `fn bigger_first<'a>(a: &'a [i32], b: &'a [i32]) -> &'a [i32]`를 작성하고, E0597이 나는 호출 예와 나지 않는 호출 예를 각각 만들자.
2. 텍스트에서 특정 단어가 포함된 줄들을 모아 두는 `struct Search<'a> { lines: Vec<&'a str> }`와 `fn new(text: &'a str, word: &str) -> Search<'a>`를 작성하자. `word`에는 왜 `'a`가 필요 없을까?
3. 다음 코드가 왜 컴파일되지 않는지 설명하고, 시그니처만 고쳐서 컴파일되게 하자.

   ```rust
   struct Config { name: String }

   impl Config {
       fn name_or<'a>(&self, default: &'a str) -> &'a str {
           if self.name.is_empty() { default } else { &self.name }
       }
   }
   ```

<details>
<summary>정답</summary>

```rust
fn bigger_first<'a>(a: &'a [i32], b: &'a [i32]) -> &'a [i32] {
    match (a.first(), b.first()) {
        (Some(x), Some(y)) if y > x => b,
        (None, Some(_)) => b,
        _ => a,
    }
}

struct Search<'a> {
    lines: Vec<&'a str>,
}

impl<'a> Search<'a> {
    fn new(text: &'a str, word: &str) -> Search<'a> {
        Search { lines: text.lines().filter(|l| l.contains(word)).collect() }
    }
}

fn main() {
    // 1. OK: 두 Vec 모두 결과보다 오래 산다
    let v1 = vec![1, 2];
    let v2 = vec![5];
    println!("{:?}", bigger_first(&v1, &v2));

    // 1. E0597: v4가 블록 끝에서 drop되는데 r이 그 뒤에 쓰임
    // let r;
    // { let v4 = vec![9]; r = bigger_first(&v1, &v4); }
    // println!("{r:?}");

    // 2
    let text = "rust is fast\nc++ is fast\nrust is safe";
    let s = Search::new(text, "rust");
    println!("{:?}", s.lines);
}
```

2. 결과(`lines`)는 `text`의 조각만 담고 `word`는 비교에만 쓰므로, `word`는 함수 호출 동안만 유효하면 된다. 그래서 별도의(생략된) 라이프타임을 받는다.

3. `&self.name`은 `self`를 빌린 것인데, 시그니처는 반환값이 `default`(`'a`)에만 묶인다고 말한다. 둘 다 반환될 수 있으므로 같은 라이프타임으로 묶는다.

```rust
fn name_or<'a>(&'a self, default: &'a str) -> &'a str {
    if self.name.is_empty() { default } else { &self.name }
}
```

</details>
