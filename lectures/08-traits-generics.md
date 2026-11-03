---
title: 트레이트와 제네릭
order: 8
minutes: 45
---

트레이트(trait)는 Rust의 다형성 도구다. C++의 **추상 클래스(인터페이스)**, **템플릿 + concepts**, **타입 특성(type traits)** 의 역할을 하나로 묶었다.
제네릭은 C++ 템플릿처럼 단형화(monomorphization)되어 런타임 비용이 없고, 트레이트 객체(`dyn Trait`)는 vtable을 통한 동적 디스패치를 제공한다.

## 트레이트 정의와 구현

```rust
trait Shape {
    fn area(&self) -> f64;                    // 구현 필수
    fn name(&self) -> String {                // 기본 구현
        "shape".to_string()
    }
    fn describe(&self) -> String {            // 다른 메서드를 사용하는 기본 구현
        format!("{} with area {:.2}", self.name(), self.area())
    }
}

struct Circle { r: f64 }
struct Square { side: f64 }

impl Shape for Circle {
    fn area(&self) -> f64 { std::f64::consts::PI * self.r * self.r }
    fn name(&self) -> String { "circle".into() } // 기본 구현 재정의
}

impl Shape for Square {
    fn area(&self) -> f64 { self.side * self.side }
}

fn main() {
    println!("{}", Circle { r: 1.0 }.describe());
    println!("{}", Square { side: 2.0 }.describe()); // shape with area 4.00
}
```

- 구현은 타입 정의와 **분리**되어 있다. 이미 있는 타입(심지어 `i32`, `Vec<T>`)에도 내 트레이트를 구현할 수 있다.
- 상속은 없다. 대신 트레이트가 다른 트레이트를 요구할 수 있다(슈퍼트레이트): `trait Shape: std::fmt::Debug { ... }`
- 트레이트 메서드를 호출하려면 그 트레이트가 스코프에 있어야 한다(`use`).

## 제네릭 함수와 트레이트 바운드

```rust
fn largest<T: PartialOrd + Copy>(xs: &[T]) -> T {
    let mut best = xs[0];
    for &x in xs {
        if x > best {
            best = x;
        }
    }
    best
}

fn main() {
    println!("{}", largest(&[3, 7, 2]));        // i32 버전 생성
    println!("{}", largest(&[1.5, 0.2]));       // f64 버전 생성
    println!("{}", largest(&['x', 'b']));       // char 버전 생성
}
```

바운드가 길어지면 `where` 절을 쓴다.

```rust
use std::fmt::Display;

fn print_all<T, U>(a: &[T], b: U)
where
    T: Display,
    U: Display + Clone,
{
    for x in a { print!("{x} "); }
    println!("{b}");
}
```

> [!cpp] **C++ 비교**
>
> C++ 템플릿은 **인스턴스화할 때** 본문을 검사한다(덕 타이핑). 그래서 에러가 깊은 곳에서 길게 터진다.
> Rust 제네릭은 **정의할 때** 바운드만 보고 본문을 검사한다. `T: PartialOrd`가 없으면 본문에서 `>`를 쓸 수 없고, 호출 측에서는 바운드를 만족하는지만 확인한다. C++20 concepts를 강제로 쓰는 것과 같다.
>
> 코드 생성 방식(단형화)은 템플릿과 같아서 성능은 동일하고, 코드 크기가 늘어나는 단점도 같다.

### impl Trait 문법

```rust
fn total_area(shapes: &[impl Shape]) -> f64 {      // 인자 위치: 익명 제네릭 파라미터
    shapes.iter().map(|s| s.area()).sum()
}

fn make_shape() -> impl Shape {                    // 반환 위치: "구체 타입은 숨긴다"
    Circle { r: 2.0 }
}
```

반환 위치의 `impl Trait`은 구체 타입이 하나로 정해져 있지만 이름을 감춘다. 클로저나 반복자처럼 **이름을 쓸 수 없는 타입**을 반환할 때 필수다(10장).

## 제네릭 타입

```rust
#[derive(Debug)]
struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    fn new() -> Self { Self { items: Vec::new() } }
    fn push(&mut self, x: T) { self.items.push(x); }
    fn pop(&mut self) -> Option<T> { self.items.pop() }
}

// 조건부 메서드: T가 Display일 때만 존재
impl<T: std::fmt::Display> Stack<T> {
    fn show(&self) -> String {
        self.items.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", ")
    }
}

// 특정 타입에만 메서드 추가
impl Stack<f64> {
    fn sum(&self) -> f64 { self.items.iter().sum() }
}
```

상수 제네릭도 있다. `std::array<T, N>`처럼 쓴다.

```rust
fn sum_array<const N: usize>(a: [i32; N]) -> i32 {
    a.iter().sum()
}
```

## 트레이트 객체: dyn Trait

서로 다른 타입을 한 컬렉션에 담거나, 런타임에 타입이 정해질 때는 **트레이트 객체**를 쓴다.

```rust
fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Circle { r: 1.0 }),
        Box::new(Square { side: 2.0 }),
    ];
    for s in &shapes {
        println!("{}", s.describe());   // vtable을 통한 동적 디스패치
    }

    let s: &dyn Shape = &Square { side: 3.0 }; // 참조로도 가능
    println!("{}", s.area());
}
```

`&dyn Shape`와 `Box<dyn Shape>`는 **(데이터 포인터, vtable 포인터)** 로 된 팻 포인터다. C++과 달리 vtable 포인터가 객체 안이 아니라 **포인터 쪽에** 있다. 그래서 일반 구조체에는 vtable 비용이 전혀 없고, 트레이트 객체로 쓸 때만 생긴다.

| | 정적 디스패치 (`T: Shape`, `impl Shape`) | 동적 디스패치 (`dyn Shape`) |
|---|---|---|
| C++ 대응 | 템플릿 | 가상 함수 |
| 호출 비용 | 직접 호출, 인라인 가능 | 간접 호출 |
| 코드 크기 | 타입마다 복사본 | 하나 |
| 다른 타입 섞기 | 불가 | 가능 (`Vec<Box<dyn Shape>>`) |

> [!warn] **주의**
>
> 모든 트레이트가 `dyn`으로 쓸 수 있는 것은 아니다(dyn compatibility, 예전 이름은 object safety). 제네릭 메서드가 있거나 `Self`를 값으로 반환하는 메서드가 있으면 vtable을 만들 수 없다. 예를 들어 `Clone`은 `fn clone(&self) -> Self` 때문에 `dyn Clone`이 안 된다.

## 연관 타입

트레이트 안에서 타입을 정의할 수 있다. 대표적인 예가 `Iterator`다.

```rust
trait Iterator {
    type Item;                                  // 연관 타입
    fn next(&mut self) -> Option<Self::Item>;
}
```

제네릭 파라미터(`trait Iterator<Item>`)였다면 한 타입이 여러 `Item`으로 여러 번 구현할 수 있었을 것이다. 연관 타입은 "타입마다 하나로 정해진다"는 뜻이다. C++의 `using value_type = ...;`과 비슷하다.

## 표준 라이브러리의 핵심 트레이트

| 트레이트 | 용도 | C++ 대응 |
|---|---|---|
| `Display`, `Debug` | `{}`, `{:?}` 포맷 | `operator<<` |
| `Clone`, `Copy` | 복제 | 복사 생성자 |
| `PartialEq`, `Eq`, `PartialOrd`, `Ord` | 비교 | `operator==`, `<=>` |
| `Hash` | 해시 | `std::hash` |
| `Default` | 기본값 | 기본 생성자 |
| `From`, `Into` | 값 변환 | 변환 생성자 |
| `TryFrom`, `TryInto` | 실패 가능한 변환 | |
| `AsRef`, `Borrow` | 싼 참조 변환 | |
| `Deref`, `DerefMut` | `*`, 자동 역참조 | `operator*`, `operator->` |
| `Drop` | 소멸자 | 소멸자 |
| `Add`, `Mul`, `Index`, `Neg` … | 연산자 오버로딩 | `operator+` … |
| `Iterator`, `IntoIterator` | 반복 | iterator, range |
| `Fn`, `FnMut`, `FnOnce` | 호출 가능 | `operator()` |
| `Send`, `Sync` | 스레드 안전성 (12장) | 없음 |

### Display와 연산자 오버로딩

```rust
use std::fmt;
use std::ops::Add;

#[derive(Debug, Clone, Copy, PartialEq)]
struct V2 {
    x: f64,
    y: f64,
}

impl fmt::Display for V2 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}

impl Add for V2 {
    type Output = V2;
    fn add(self, o: V2) -> V2 {
        V2 { x: self.x + o.x, y: self.y + o.y }
    }
}

impl From<(f64, f64)> for V2 {
    fn from((x, y): (f64, f64)) -> Self {
        V2 { x, y }
    }
}

fn main() {
    let a = V2 { x: 1.0, y: 2.0 };
    let b: V2 = (3.0, 4.0).into();      // From을 구현하면 Into가 자동으로 생김
    println!("{}", a + b);              // (4, 6)
    println!("{}", a.to_string());      // Display를 구현하면 to_string()이 생김
}
```

마지막 두 줄은 **블랭킷 구현(blanket impl)** 덕분이다. 표준 라이브러리에 `impl<T: Display> ToString for T`와 `impl<T, U: From<T>> Into<U> for T`가 있어서, 바운드를 만족하는 모든 타입이 자동으로 기능을 얻는다.

## 고아 규칙

트레이트 구현은 **트레이트나 타입 중 하나가 내 크레이트 것**일 때만 할 수 있다(orphan rule). `impl Display for Vec<i32>`는 둘 다 외부 것이라 안 된다(E0117).
이 규칙 덕분에 두 크레이트가 같은 구현을 각자 만들어 충돌하는 일이 없다. 꼭 필요하면 뉴타입으로 감싼다.

```rust
struct Wrapper(Vec<String>);

impl std::fmt::Display for Wrapper {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "[{}]", self.0.join(", "))
    }
}
```

## 흔한 컴파일 에러

| 코드 | 메시지 | 원인 |
|---|---|---|
| E0277 | the trait bound `T: Display` is not satisfied | 제네릭에 바운드 누락, 또는 타입이 트레이트 미구현 |
| E0369 | binary operation `>` cannot be applied to type `T` | `T: PartialOrd` 바운드 누락 |
| E0599 | no method named `area` found | 트레이트를 `use`하지 않음, 또는 바운드 누락 |
| E0038 | the trait `X` is not dyn compatible | 제네릭 메서드나 `Self` 반환 때문에 `dyn` 불가 |
| E0117 | only traits defined in the current crate can be implemented for types defined outside | 고아 규칙 → 뉴타입 |
| E0282 | type annotations needed | 제네릭 타입을 추론할 수 없음 → `::<T>` 또는 타입 명시 |

```rust
fn biggest<T>(a: T, b: T) -> T {
    if a > b { a } else { b }     // error[E0369]: binary operation `>` cannot be applied to type `T`
}                                 // help: consider restricting type parameter `T` with trait `PartialOrd`
```

## 정리

- 트레이트는 인터페이스 + concepts다. 구현은 타입과 분리되어 있고, 기본 메서드를 가질 수 있다.
- 제네릭은 정의 시점에 바운드로 검사되고, 템플릿처럼 단형화된다.
- `impl Trait`은 인자에서는 익명 제네릭, 반환에서는 숨겨진 구체 타입이다.
- `dyn Trait`은 팻 포인터 + vtable 동적 디스패치다. 이종 컬렉션에 쓴다.
- `Display`, `From`, `Add` 같은 표준 트레이트를 구현하면 언어 기능(포맷, `into`, `+`)과 연결된다.

## 연습문제

1. `trait Animal { fn name(&self) -> String; fn sound(&self) -> String; fn speak(&self) -> String { ... } }`을 정의하고 `Dog`, `Cat`에 구현하자. `Vec<Box<dyn Animal>>`에 담아 모두 `speak()`를 호출하자.
2. `struct Matrix2 { a: [[i32; 2]; 2] }`에 `Mul`(행렬 곱)과 `Display`를 구현하자.
3. `fn max_by_key<T, K: Ord>(items: &[T], key: impl Fn(&T) -> K) -> Option<&T>`를 구현하자.

<details>
<summary>정답</summary>

```rust
use std::fmt;
use std::ops::Mul;

trait Animal {
    fn name(&self) -> String;
    fn sound(&self) -> String;
    fn speak(&self) -> String {
        format!("{} says {}", self.name(), self.sound())
    }
}

struct Dog;
struct Cat;
impl Animal for Dog {
    fn name(&self) -> String { "dog".into() }
    fn sound(&self) -> String { "woof".into() }
}
impl Animal for Cat {
    fn name(&self) -> String { "cat".into() }
    fn sound(&self) -> String { "meow".into() }
}

#[derive(Clone, Copy)]
struct Matrix2 {
    a: [[i32; 2]; 2],
}

impl Mul for Matrix2 {
    type Output = Matrix2;
    fn mul(self, o: Matrix2) -> Matrix2 {
        let mut r = [[0; 2]; 2];
        for i in 0..2 {
            for j in 0..2 {
                for k in 0..2 {
                    r[i][j] += self.a[i][k] * o.a[k][j];
                }
            }
        }
        Matrix2 { a: r }
    }
}

impl fmt::Display for Matrix2 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for row in &self.a {
            writeln!(f, "{} {}", row[0], row[1])?;
        }
        Ok(())
    }
}

fn max_by_key<T, K: Ord>(items: &[T], key: impl Fn(&T) -> K) -> Option<&T> {
    let mut best: Option<&T> = None;
    for item in items {
        match best {
            Some(b) if key(b) >= key(item) => {}
            _ => best = Some(item),
        }
    }
    best
    // 실전에서는 items.iter().max_by_key(|x| key(x))
}

fn main() {
    let zoo: Vec<Box<dyn Animal>> = vec![Box::new(Dog), Box::new(Cat)];
    for a in &zoo {
        println!("{}", a.speak());
    }

    let m = Matrix2 { a: [[1, 1], [1, 0]] };
    print!("{}", m * m * m);     // 피보나치 행렬: 3 2 / 2 1

    let words = ["rust", "c", "python"];
    println!("{:?}", max_by_key(&words, |w| w.len())); // Some("python")
}
```

</details>
