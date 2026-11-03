---
title: 빌림과 참조
order: 3
minutes: 45
---

앞 장에서 값을 함수에 넘길 때마다 소유권이 이동해서 불편하다는 것을 봤다. 해결책은 **참조(reference)** 로 값을 **빌리는(borrow)** 것이다.
Rust의 참조는 C++의 참조나 포인터와 비슷해 보이지만, 컴파일러의 **빌림 검사기(borrow checker)** 가 다음 두 가지를 정적으로 보장한다.

- 참조는 절대 댕글링되지 않는다.
- 데이터를 가리키는 가변 참조가 있으면, 같은 데이터를 가리키는 다른 참조는 없다.

이 장을 이해하면 Rust 코드의 80%는 읽을 수 있다.

## 공유 참조 `&T`

```rust
fn length(s: &String) -> usize {   // String을 빌림. 소유권은 가져가지 않음
    s.len()
}   // s는 참조일 뿐이므로 여기서 아무것도 해제되지 않음

fn main() {
    let s = String::from("hello");
    let n = length(&s);            // 호출 측에서도 &를 명시
    println!("{s} has {n} bytes"); // s는 여전히 유효
}
```

- `&s`는 `s`를 가리키는 참조를 만든다. 이를 "빌린다"고 한다.
- `&T`로는 값을 **읽기만** 할 수 있다(C++의 `const T&`).
- 공유 참조는 **여러 개를 동시에** 만들 수 있고, `Copy` 타입이다.

## 가변 참조 `&mut T`

```rust
fn append_world(s: &mut String) {
    s.push_str(" world");
}

fn main() {
    let mut s = String::from("hello"); // 원본도 mut여야 함
    append_world(&mut s);              // 호출 측에서 &mut 명시
    println!("{s}");
}
```

> [!cpp] **C++ 비교**
>
> C++에서 `f(x)`만 보고는 `x`가 값 복사인지, `const&`인지, 수정 가능한 `&`인지 알 수 없다. Rust는 **호출 지점에서** `f(x)`(이동/복사), `f(&x)`(읽기), `f(&mut x)`(수정)가 구분되어 코드 리뷰가 쉬워진다.
>
> | Rust | C++ |
> |---|---|
> | `T` | `T` (`std::move`로 전달) |
> | `&T` | `const T&` |
> | `&mut T` | `T&` |
> | `*const T`, `*mut T` (unsafe) | `const T*`, `T*` |

## 빌림 규칙: 공유 XOR 가변

어느 시점이든, 한 값에 대해 다음 중 **하나만** 허용된다.

- 공유 참조 `&T`가 **여러 개**
- 가변 참조 `&mut T`가 **딱 하나**

컴파일 타임에 동작하는 reader-writer lock이라고 생각하면 된다.

```rust
let mut s = String::from("hi");

let r1 = &s;
let r2 = &s;          // OK: 공유 참조 여러 개
println!("{r1} {r2}");

let w1 = &mut s;
// let w2 = &mut s;   // error[E0499]: cannot borrow `s` as mutable more than once at a time
w1.push('!');
```

### 왜 이 규칙이 필요한가: 반복자 무효화

C++에서 흔한 UB부터 보자.

```cpp
std::vector<int> v{1, 2, 3};
int& first = v[0];
v.push_back(4);        // 재할당이 일어나면 first는 해제된 메모리를 가리킴
std::cout << first;    // UB
```

Rust에서는 같은 코드가 컴파일되지 않는다.

```rust
let mut v = vec![1, 2, 3];
let first = &v[0];     // 공유 빌림 시작
v.push(4);             // error[E0502]: cannot borrow `v` as mutable because it is also borrowed as immutable
println!("{first}");   // 공유 빌림이 여기까지 살아 있음
```

`push`는 `&mut self`를 요구하는데, `first`라는 공유 참조가 아직 쓰이고 있으므로 충돌한다. 이 규칙 하나로 반복자 무효화, 댕글링 참조, (멀티스레드에서는) 데이터 레이스가 한꺼번에 막힌다.

### 빌림은 마지막 사용 지점에서 끝난다 (NLL)

빌림의 범위는 렉시컬 스코프가 아니라 **참조가 마지막으로 사용되는 지점**까지다. 이를 NLL(Non-Lexical Lifetimes)이라고 부른다.

```rust
let mut v = vec![1, 2, 3];
let first = &v[0];
println!("{first}");   // first의 마지막 사용 → 빌림 종료
v.push(4);             // OK
```

## 댕글링 참조 방지

```rust
fn dangle() -> &String {          // error[E0106]: missing lifetime specifier
    let s = String::from("hi");
    &s                            // s는 함수가 끝나면 해제됨
}
```

C++에서는 경고만 나오고 컴파일되는 지역 변수 참조 반환이 Rust에서는 에러다. 해결책은 소유권을 넘기는 것, 즉 `String`을 그대로 반환하는 것이다.

```rust
fn no_dangle() -> String {
    String::from("hi")
}
```

스코프를 넘어 참조를 들고 있는 경우도 잡아낸다.

```rust
let r;
{
    let x = 5;
    r = &x;           // error[E0597]: `x` does not live long enough
}
println!("{r}");
```

참조가 "얼마나 오래 유효한가"를 **라이프타임(lifetime)** 이라고 한다. 대부분은 컴파일러가 알아서 추론하며, 명시해야 하는 경우는 9장에서 다룬다.

## 슬라이스: `&str`과 `&[T]`

슬라이스(slice)는 연속된 메모리의 일부를 가리키는 **(포인터, 길이)** 쌍이다. "팻 포인터(fat pointer)"라고도 한다.

```rust
let s = String::from("hello world");
let hello: &str = &s[0..5];     // 바이트 범위
let world: &str = &s[6..];

let arr = [1, 2, 3, 4, 5];
let mid: &[i32] = &arr[1..4];   // [2, 3, 4]
println!("{hello} {world} {mid:?}");
```

> [!cpp] **C++ 비교**
>
> `&str`은 `std::string_view`, `&[T]`는 `std::span<const T>`, `&mut [T]`는 `std::span<T>`에 해당한다.
> 차이는 **빌림 검사기가 원본보다 오래 살지 못하게 보장**한다는 점이다. `string_view`가 임시 `std::string`을 가리키는 고전적인 버그가 Rust에는 없다.

함수 인자로는 `&String`보다 **`&str`** 을, `&Vec<T>`보다 **`&[T]`** 를 받는 것이 관용적이다. `&String`은 자동으로 `&str`로 변환되므로(deref coercion) 더 많은 입력을 받을 수 있다.

```rust
fn first_word(s: &str) -> &str {
    s.split_whitespace().next().unwrap_or("")
}

fn sum(xs: &[i32]) -> i32 {
    xs.iter().sum()
}

fn main() {
    let owned = String::from("hello world");
    println!("{}", first_word(&owned));     // &String → &str
    println!("{}", first_word("literal"));  // 문자열 리터럴은 원래 &'static str

    let v = vec![1, 2, 3];
    println!("{} {}", sum(&v), sum(&[4, 5])); // &Vec<i32> → &[i32]
}
```

반환된 `&str`은 입력을 빌린 것이므로, 원본이 바뀌면 안 된다.

```rust
let mut s = String::from("hello world");
let w = first_word(&s);
s.clear();             // error[E0502]: s가 w에 의해 빌려진 상태
println!("{w}");
```

> [!warn] **주의**
>
> 문자열 슬라이스의 인덱스는 **바이트** 단위다. UTF-8 문자 경계가 아닌 곳을 자르면 panic이 난다. `&"한글"[0..1]`은 panic이다. 문자열은 7장에서 자세히 다룬다.

## 역참조와 자동 참조

```rust
let mut x = 10;
let r = &mut x;
*r += 1;                  // 명시적 역참조

let v = vec![1, 2, 3];
let rv = &v;
println!("{}", rv.len()); // 메서드 호출은 자동 역참조. ->는 없음

let mut nums = vec![1, 2, 3];
for n in &mut nums {      // n: &mut i32
    *n *= 2;
}
for n in &nums {          // n: &i32
    print!("{n} ");       // 출력은 자동으로 역참조됨
}
```

- `.` 연산자는 필요한 만큼 자동으로 `&`, `&mut`, `*`를 붙여 준다. C++의 `.`와 `->` 구분이 없다.
- 산술 연산이나 대입에는 `*`가 필요한 경우가 많다.
- `for x in v`는 `v`를 **소비(이동)** 하고, `for x in &v`는 빌리며, `for x in &mut v`는 가변으로 빌린다.

### 재대여(reborrow)

`&mut T`는 `Copy`가 아닌데도 다음 코드는 동작한다.

```rust
fn add_one(v: &mut Vec<i32>) {
    v.push(1);
}

let mut v = Vec::new();
let r = &mut v;
add_one(r);   // r이 이동하지 않고 &mut *r로 "재대여"됨
add_one(r);   // 그래서 다시 쓸 수 있음
```

컴파일러가 `add_one(&mut *r)`로 바꿔 주기 때문이다. 새로운 짧은 가변 빌림이 생기고, 호출이 끝나면 `r`이 다시 유효해진다.

## 빌림 검사기가 똑똑한 경우와 아닌 경우

### 구조체의 서로 다른 필드는 동시에 빌릴 수 있다

```rust
struct Player {
    name: String,
    score: u32,
}

let mut p = Player { name: "kim".into(), score: 0 };
let name = &p.name;      // name 필드를 공유 빌림
p.score += 10;           // score 필드 수정: OK (서로 다른 필드)
println!("{name} {}", p.score);
```

단, **메서드**를 통하면 구조체 전체를 빌리므로 이 분리가 사라진다. `p.name()`이 `&self`를 받는다면 `p.add_score()`(`&mut self`)와 충돌한다.

### 배열의 서로 다른 원소는 구분하지 못한다

```rust
let mut a = [1, 2, 3, 4];
// let x = &mut a[0];
// let y = &mut a[1];    // error[E0499]: 컴파일러는 인덱스가 다른지 모름

let (left, right) = a.split_at_mut(2); // 겹치지 않는 두 가변 슬라이스
left[0] += right[0];
println!("{a:?}");       // [4, 2, 3, 4]
```

`split_at_mut`은 내부적으로 `unsafe`를 쓰지만 겹치지 않음을 보장하는 **안전한 API**이다. 이것이 Rust 표준 라이브러리의 전형적인 패턴이다.

### 참조 뒤의 값을 꺼내려면: `mem::take`, `mem::replace`

`&mut` 참조만 가지고 있을 때 안의 값을 이동해서 꺼낼 수는 없다(E0507). 그 자리에 무언가를 **대신 넣어 둬야** 한다.

```rust
use std::mem;

struct Buffer {
    data: Vec<u8>,
}

fn flush(buf: &mut Buffer) -> Vec<u8> {
    // return buf.data;                // error[E0507]: cannot move out of `buf.data` which is behind a mutable reference
    mem::take(&mut buf.data)           // 빈 Vec(Default)을 넣고 기존 값을 꺼냄
}

fn reset(buf: &mut Buffer) -> Vec<u8> {
    mem::replace(&mut buf.data, Vec::with_capacity(64)) // 지정한 값으로 교체
}
```

`mem::swap(&mut a, &mut b)`도 자주 쓴다. C++의 `std::exchange`, `std::swap`과 같은 용도다.

## 빌림 검사기와 싸우지 않는 요령

1. **빌림을 짧게 유지해라.** 참조를 오래 들고 있지 말고, 필요할 때 다시 빌려라.
2. **참조 대신 인덱스나 키를 저장해라.** 그래프나 트리처럼 서로 가리키는 구조는 `Vec`과 인덱스로 표현하는 것이 관용적이다.
3. **읽기와 쓰기 단계를 나눠라.** 순회하면서 수정해야 한다면, 먼저 변경 사항을 모은 뒤 따로 적용한다.
4. **처음에는 `clone()`을 써도 된다.** 프로파일링 후 필요한 곳만 최적화해라.

```rust
let mut v = vec![1, 2, 3];

// for x in &v {
//     if *x > 1 { v.push(*x * 10); }   // error[E0502]: 순회 중 수정
// }

let extra: Vec<i32> = v.iter().filter(|x| **x > 1).map(|x| x * 10).collect(); // 1단계: 읽기
v.extend(extra);                                                               // 2단계: 쓰기
println!("{v:?}"); // [1, 2, 3, 20, 30]
```

## 흔한 컴파일 에러

| 코드 | 메시지 | 흔한 원인 |
|---|---|---|
| E0499 | cannot borrow as mutable more than once | `&mut`를 두 개 동시에 사용 |
| E0502 | cannot borrow as mutable because it is also borrowed as immutable | 읽는 중에 수정 (반복자 무효화 패턴) |
| E0505 | cannot move out because it is borrowed | 빌려준 값을 이동 |
| E0506 | cannot assign because it is borrowed | 빌려준 값에 대입 |
| E0596 | cannot borrow as mutable | 변수에 `mut`를 안 붙임 |
| E0597 | does not live long enough | 참조가 원본보다 오래 살아남음 |
| E0106 | missing lifetime specifier | 지역 변수 참조 반환 등 (9장) |
| E0507 | cannot move out of ... behind a reference | 참조 뒤의 값을 이동 → `clone`, `mem::take` |

```rust
let s = String::from("a");
let r = &s;
let t = s;          // error[E0505]: cannot move out of `s` because it is borrowed
println!("{r} {t}");
```

```rust
let v = Vec::new();
v.push(1);          // error[E0596]: cannot borrow `v` as mutable, as it is not declared as mutable
```

## 정리

- `&T`는 공유(읽기) 빌림, `&mut T`는 배타적(쓰기) 빌림이다. 호출 지점에서도 명시한다.
- **공유 XOR 가변**: 여러 개의 `&T` 또는 하나의 `&mut T`. 이 규칙이 반복자 무효화와 데이터 레이스를 막는다.
- 빌림은 마지막 사용 지점에서 끝난다(NLL). 참조는 원본보다 오래 살 수 없다.
- 인자로는 `&str`, `&[T]` 같은 슬라이스를 받아라.
- 참조 뒤의 값을 꺼낼 때는 `mem::take`/`mem::replace`를 쓴다.

## 연습문제

1. 문자열 슬라이스 목록에서 가장 긴 단어의 길이를 반환하는 `fn longest_len(words: &[&str]) -> usize`와, 문자열 끝에 `!`를 n번 붙이는 `fn exclaim(s: &mut String, n: usize)`를 작성해라.
2. 다음 코드는 왜 컴파일되지 않을까? 고쳐 봐라.

   ```rust
   fn main() {
       let mut scores = vec![10, 20, 30];
       let max = scores.iter().max().unwrap();
       scores.push(5);
       println!("previous max = {max}, now {scores:?}");
   }
   ```

3. 다음 중 컴파일되는 것을 고르고 이유를 설명해라.

   ```rust
   // (a)
   let mut s = String::from("x");
   let r = &s;
   s.push('y');
   println!("{r}");

   // (b)
   let mut s = String::from("x");
   let r = &s;
   println!("{r}");
   s.push('y');

   // (c)
   let mut s = String::from("x");
   let r = &mut s;
   r.push('y');
   println!("{s}");
   ```

<details>
<summary>정답</summary>

1. 반복문 또는 반복자로 구현할 수 있다.

   ```rust
   fn longest_len(words: &[&str]) -> usize {
       let mut best = 0;
       for w in words {
           best = best.max(w.len());
       }
       best
       // 또는: words.iter().map(|w| w.len()).max().unwrap_or(0)
   }

   fn exclaim(s: &mut String, n: usize) {
       for _ in 0..n {
           s.push('!');
       }
   }

   fn main() {
       println!("{}", longest_len(&["a", "abc", "ab"])); // 3
       let mut s = String::from("hi");
       exclaim(&mut s, 3);
       println!("{s}"); // hi!!!
   }
   ```

2. `max`는 `scores` 안의 원소를 가리키는 `&i32`이다. `push`가 가변으로 빌리는 시점에 `max`(공유 빌림)가 아직 이후에 쓰이므로 E0502가 난다. `push`가 재할당하면 `max`가 댕글링되므로 정당한 에러다. 값을 먼저 복사해 빌림을 끝내면 된다.

   ```rust
   let max = *scores.iter().max().unwrap(); // i32로 복사 → 빌림 종료
   // 또는 let max = scores.iter().max().copied().unwrap();
   scores.push(5);
   println!("previous max = {max}, now {scores:?}");
   ```

3. (a)는 에러(E0502), `r`이 `push` 이후에도 쓰인다. (b)는 OK, `r`의 마지막 사용이 `push` 이전이다(NLL). (c)도 OK, `r`의 마지막 사용(`push`) 이후에 `s`를 읽는다.

</details>
