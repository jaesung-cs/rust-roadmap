---
title: 소유권과 이동
order: 2
minutes: 45
---

소유권(ownership)은 Rust에서 가장 중요한 개념이다. GC 없이 메모리 안전성을 보장하는 장치이며, 이후 모든 장이 이 위에 쌓인다.
좋은 소식은, C++의 **RAII**와 **`unique_ptr`/move semantics**를 이해하고 있다면 이미 절반은 알고 있다는 것이다.
Rust는 그 아이디어를 **언어의 기본값**으로 만들고, 컴파일러가 규칙 위반을 잡아낸다.

## 소유권 규칙 세 가지

1. 모든 값에는 **소유자(owner)** 라는 변수가 하나 있다.
2. 소유자는 **한 번에 하나**뿐이다.
3. 소유자가 스코프를 벗어나면 값은 **해제(drop)** 된다.

```rust
fn main() {
    {
        let s = String::from("hello"); // s가 힙 버퍼를 소유
        println!("{s}");
    } // s가 스코프를 벗어남 → 자동으로 drop → 힙 메모리 해제
}
```

여기까지는 C++의 `std::string`과 같다. 차이는 **대입할 때** 생긴다.

## 이동(move)

```rust
let s1 = String::from("hello");
let s2 = s1;            // s1의 소유권이 s2로 "이동"
// println!("{s1}");    // error[E0382]: borrow of moved value: `s1`
println!("{s2}");
```

`String`은 스택에 `(포인터, 길이, 용량)` 세 워드를 갖고, 실제 문자열은 힙에 있다. `let s2 = s1;`은 이 세 워드를 **비트 단위로 복사(memcpy)** 하고, 이후 `s1`은 **사용할 수 없는 상태**가 된다. 힙 데이터는 복사되지 않는다.
소유자는 `s2` 하나뿐이므로 스코프 끝에서 해제도 한 번만 일어난다. 이중 해제(double free)가 생길 수 없다.

> [!cpp] **C++ 비교**
>
> | | C++ | Rust |
> |---|---|---|
> | `b = a` | **복사** (복사 생성자) | **이동** |
> | 이동하려면 | `b = std::move(a)` | 기본 동작 |
> | 복사하려면 | 기본 동작 | `b = a.clone()` |
> | 이동 후 원본 | "유효하지만 미지정" 상태, 여전히 사용 가능 | **사용 불가** (컴파일 에러) |
> | 이동의 구현 | 사용자 정의 이동 생성자 실행 | 항상 memcpy. 사용자 코드 없음 |
> | 원본의 소멸자 | 실행됨 (moved-from 객체도 소멸) | 실행되지 않음 |
>
> Rust의 이동은 **파괴적 이동(destructive move)** 이다. 이동된 원본은 논리적으로 사라지므로 moved-from 상태를 처리하는 코드가 필요 없고,
> rule of five도 필요 없다.

이동이 항상 memcpy라는 점은 중요한 결과를 낳는다. 객체가 **자기 자신의 주소를 가리키는 포인터**를 안전하게 가질 수 없다(이동하면 주소가 바뀌니까). 이 문제는 async를 다루는 13장의 `Pin`에서 다시 등장한다.

## 명시적 복사: Clone

깊은 복사가 필요하면 `.clone()`을 호출한다. 비용이 드는 연산이 코드에 **눈에 보이게** 드러난다.

```rust
let s1 = String::from("hello");
let s2 = s1.clone();    // 힙 버퍼까지 복사
println!("{s1} {s2}");  // 둘 다 사용 가능
```

## Copy 타입

정수, 실수, `bool`, `char` 같은 단순한 타입은 이동 대신 **복사**된다. 이 타입들은 `Copy` 트레이트를 구현한다.

```rust
let x = 5;
let y = x;              // 복사. x는 여전히 유효
println!("{x} {y}");
```

| Copy인 타입 | Copy가 아닌 타입 |
|---|---|
| 모든 정수, 실수, `bool`, `char` | `String`, `Vec<T>`, `Box<T>` |
| 공유 참조 `&T` | 가변 참조 `&mut T` |
| 원소가 모두 Copy인 튜플, 배열 | `Drop`을 구현한 모든 타입 |

직접 만든 타입도 모든 필드가 Copy라면 `derive`로 Copy를 붙일 수 있다.

```rust
#[derive(Clone, Copy, Debug)]
struct Point {
    x: f64,
    y: f64,
}

let p1 = Point { x: 1.0, y: 2.0 };
let p2 = p1;            // 복사
println!("{p1:?} {p2:?}");
```

`Copy`는 "memcpy만으로 복사해도 안전하다"는 표시이고, `Clone`은 "복사 방법(`.clone()`)이 있다"는 뜻이다. `Copy`인 타입은 반드시 `Clone`도 구현해야 한다.
C++로 말하면 `Copy`는 trivially copyable 타입에 해당한다.

> [!warn] **주의**
>
> `Drop`을 구현한 타입은 `Copy`가 될 수 없다. 소멸자가 있는 타입을 비트 복사하면 이중 해제가 생기기 때문이다.

## 함수 호출과 소유권

함수 인자 전달도 대입과 같은 규칙을 따른다. 값으로 넘기면 **이동**한다.

```rust
fn take(s: String) {
    println!("took {s}");
} // s가 여기서 drop

fn make() -> String {
    let s = String::from("made");
    s // 소유권이 호출자로 이동 (복사 없음)
}

fn main() {
    let a = String::from("hi");
    take(a);                // a가 함수로 이동
    // println!("{a}");     // error[E0382]: borrow of moved value: `a`

    let b = make();         // 반환값의 소유권을 받음
    println!("{b}");

    let n = 10;
    let m = n;              // i32는 Copy이므로 n은 계속 사용 가능
    println!("{n} {m}");
}
```

> [!cpp] **C++ 비교**
>
> `fn take(s: String)`은 C++의 `void take(std::string s)`에 `std::move`로 넘기는 것과 같다.
> `fn take(p: Box<T>)`는 `void take(std::unique_ptr<T> p)`와 정확히 대응한다. 함수 시그니처만 봐도 "소유권을 가져가는 함수"인지 알 수 있다.

값을 함수에 넘겼다가 다시 쓰고 싶을 때마다 돌려받는 것은 번거롭다.

```rust
fn length(s: String) -> (String, usize) {
    let len = s.len();
    (s, len) // 소유권을 다시 돌려줌
}
```

이 문제를 해결하는 것이 다음 장의 **빌림(borrowing)**, 즉 참조다.

## 조건부 이동과 루프

컴파일러는 모든 실행 경로에서 값이 이동했는지를 추적한다.

```rust
fn consume(_s: String) {}

let s = String::from("x");
if std::env::args().count() > 1 {   // 런타임에만 알 수 있는 조건
    consume(s);             // 한 경로에서만 이동
}
// println!("{s}");         // error[E0382]: 이동했을 "수도 있으므로" 사용 불가
```

```rust
let s = String::from("x");
for _ in 0..2 {
    consume(s);             // error[E0382]: value moved here, in previous iteration of loop
}
```

루프에서 쓰려면 `consume(s.clone())`처럼 매번 복제하거나, 다음 장처럼 참조를 넘긴다.

조건부로 이동한 값의 해제는 컴파일러가 숨겨진 **drop 플래그**로 처리한다. 이동되지 않은 경우에만 스코프 끝에서 drop된다.

## Drop: Rust의 RAII

`Drop` 트레이트를 구현하면 소멸자를 정의할 수 있다. 파일 핸들, 락, 소켓 같은 자원 정리에 쓴다.

```rust
struct Noisy(&'static str);

impl Drop for Noisy {
    fn drop(&mut self) {
        println!("drop {}", self.0);
    }
}

fn main() {
    let _a = Noisy("a");
    let _b = Noisy("b");
    {
        let _c = Noisy("c");
    }                         // "drop c"
    let d = Noisy("d");
    drop(d);                  // std::mem::drop: 즉시 해제 → "drop d"
    println!("end of main");
}                             // "drop b", "drop a" (선언의 역순)
```

출력:

```text
drop c
drop d
end of main
drop b
drop a
```

- 지역 변수는 C++처럼 **선언의 역순**으로 drop된다.
- `drop(x)`는 특별한 함수가 아니다. `fn drop<T>(_x: T) {}`, 즉 값을 받아서 아무것도 안 하는 함수다. 소유권이 함수로 이동하고 함수가 끝날 때 해제된다. 소유권 모델이 얼마나 일관적인지 보여 주는 예다.
- `x.drop()`을 직접 호출할 수는 없다(이중 해제 방지).

> [!warn] **주의**
>
> `let _ = Noisy("e");`는 **즉시** drop된다. `_`는 바인딩을 만들지 않기 때문이다. 반면 `let _e = ...`는 스코프 끝까지 살아 있다.
> 락 가드(`MutexGuard`)를 `let _ = m.lock();`으로 받으면 락이 바로 풀리는 버그가 생긴다.

> [!cpp] **C++ 비교**
>
> 구조체 필드의 drop 순서는 C++과 **반대**이다. C++은 멤버를 선언의 역순으로 소멸시키지만, Rust는 필드를 **선언 순서대로** drop한다.
> 필드 간 소멸 순서에 의존하는 코드라면 주의하자.

## 부분 이동

구조체의 필드 하나만 꺼내 이동할 수도 있다. 그 후에는 구조체 전체를 쓸 수 없고, 남은 필드만 쓸 수 있다.

```rust
struct User {
    name: String,
    email: String,
    age: u32,
}

let u = User { name: "kim".into(), email: "k@x.com".into(), age: 30 };
let name = u.name;          // name 필드만 이동
println!("{} {}", u.email, u.age); // OK: 이동하지 않은 필드
// println!("{}", u.name);  // error[E0382]: 이동된 필드
// let v = u;               // error[E0382]: 부분적으로 이동된 값
```

단, `Drop`을 구현한 타입에서는 필드를 꺼낼 수 없다(E0509). 소멸자가 완전한 객체를 기대하기 때문이다.

## 흔한 컴파일 에러

| 코드 | 의미 | 해결 방법 |
|---|---|---|
| E0382 | 이동된 값 사용 (use after move) | 참조로 넘기기(3장), `.clone()`, 구조 변경 |
| E0507 | 참조 뒤에 있는 값을 꺼내 이동하려 함 | `.clone()`, `std::mem::take`(3장) |
| E0509 | `Drop` 타입에서 필드를 이동하려 함 | 필드를 `Option`으로 감싸고 `take()` |
| E0184 | `Drop` 타입에 `Copy`를 derive함 | 둘 중 하나만 선택 |

```text
error[E0382]: borrow of moved value: `a`
  |
2 |     let a = String::from("hi");
  |         - move occurs because `a` has type `String`, which does not implement the `Copy` trait
3 |     take(a);
  |          - value moved here
4 |     println!("{a}");
  |               ^^^ value borrowed here after move
  |
help: consider cloning the value if the performance cost is acceptable
  |
3 |     take(a.clone());
  |           ++++++++
```

컴파일러가 해결책(`.clone()`)까지 제안한다. 처음 배울 때는 `clone()`을 써도 괜찮다. 익숙해진 뒤 참조로 바꾸면 된다.

## 정리

- 모든 값은 소유자가 정확히 하나이며, 소유자가 사라지면 값도 해제된다(RAII).
- 대입과 값 전달은 기본적으로 **파괴적 이동**이다. 이동된 변수는 컴파일러가 사용을 막는다.
- 깊은 복사는 `.clone()`으로 명시하고, 단순한 타입은 `Copy`라서 자동으로 복사된다.
- 함수 시그니처의 `T`(값)는 "소유권을 가져간다"는 뜻이다.
- `Drop`은 소멸자다. `drop(x)`로 일찍 해제할 수 있고, `let _ =`는 즉시 해제된다.

## 연습문제

1. 아래 코드가 왜 컴파일되지 않는지 설명하고, 두 가지 방법(`clone` 사용, 반환값으로 돌려받기)으로 고치자.

   ```rust
   fn shout(s: String) -> usize {
       println!("{}!", s.to_uppercase());
       s.len()
   }

   fn main() {
       let msg = String::from("hello");
       let n = shout(msg);
       println!("{msg} has {n} bytes");
   }
   ```

2. 다음 각 변수가 `let b = a;` 이후에도 `a`를 쓸 수 있는지 예측하자: `a: (i32, f64)`, `a: [String; 2]`, `a: &String`, `a: (i32, String)`.
3. `Noisy`를 필드로 두 개 갖는 구조체를 만들어 drop 순서를 확인하자. C++ 클래스 멤버 소멸 순서와 비교해 보자.

<details>
<summary>정답</summary>

1. `msg`가 `shout`로 이동했기 때문에 이후 `println!`에서 쓸 수 없다(E0382).

   ```rust
   // (a) clone
   let n = shout(msg.clone());

   // (b) 소유권 돌려받기
   fn shout(s: String) -> (String, usize) {
       println!("{}!", s.to_uppercase());
       let len = s.len();
       (s, len)
   }
   let (msg, n) = shout(msg); // 섀도잉으로 다시 받음
   ```

   가장 좋은 해법은 다음 장의 `fn shout(s: &str) -> usize`이다.

2. `(i32, f64)`: 사용 가능(Copy). `[String; 2]`: 불가(String이 Copy가 아님). `&String`: 사용 가능(공유 참조는 Copy). `(i32, String)`: 불가.

3. 필드는 선언 순서대로 drop된다.

   ```rust
   struct Pair { _first: Noisy, _second: Noisy }
   let _p = Pair { _first: Noisy("first"), _second: Noisy("second") };
   // drop first → drop second (선언 순서). C++은 second → first.
   ```

</details>
