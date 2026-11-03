---
title: 구조체, 열거형, 패턴 매칭
order: 4
minutes: 40
---

Rust에는 클래스와 상속이 없다. 데이터는 **구조체(struct)** 와 **열거형(enum)** 으로 정의하고, 동작은 `impl` 블록과 트레이트(8장)로 붙인다.
특히 Rust의 enum은 C++의 `enum`이 아니라 `std::variant`에 가까운 **합 타입(sum type)** 이고, `match`와 함께 쓰면 C++보다 훨씬 안전하고 간결하다.

## 구조체

```rust
#[derive(Debug, Clone, PartialEq)]
struct User {
    name: String,
    age: u32,
    active: bool,
}

fn main() {
    let name = String::from("kim");
    let u1 = User { name, age: 30, active: true }; // 필드 이름과 변수 이름이 같으면 축약
    let u2 = User { age: 31, ..u1.clone() };       // 나머지 필드는 u1에서 가져옴
    println!("{u1:?}\n{u2:#?}");
    println!("{}", u1 == u2);                      // PartialEq derive 덕분에 비교 가능
}
```

- 모든 필드를 초기화해야 한다. 기본값 없는 생성은 없다.
- `..u1`은 남은 필드를 **이동**한다. `u1.clone()` 없이 쓰면 `name`이 이동해 `u1`을 더는 쓸 수 없다.
- 가변성은 필드 단위가 아니라 **바인딩 단위**다. `let mut u = ...`이면 모든 필드를 바꿀 수 있다. C++의 `mutable` 같은 필드별 지정은 없다(11장의 내부 가변성으로 대신한다).

### 튜플 구조체와 유닛 구조체

```rust
struct Meters(f64);          // 튜플 구조체. 필드는 .0으로 접근
struct Color(u8, u8, u8);
struct Marker;               // 유닛 구조체. 크기 0

let d = Meters(3.5);
let Color(r, g, b) = Color(255, 128, 0); // 구조 분해
println!("{} {r} {g} {b}", d.0);
```

필드 하나짜리 튜플 구조체는 **뉴타입(newtype) 패턴**이다. `Meters`와 `Seconds`를 다른 타입으로 만들어 단위 혼동을 막고, 런타임 비용은 없다. C++의 strong typedef와 같은 용도다.

## 메서드와 연관 함수: `impl`

```rust
#[derive(Debug)]
struct Rect {
    w: f64,
    h: f64,
}

impl Rect {
    // 연관 함수(associated function): self가 없다. C++의 static 멤버 함수
    fn new(w: f64, h: f64) -> Self {
        Self { w, h }
    }

    fn square(s: f64) -> Self {
        Self { w: s, h: s }
    }

    fn area(&self) -> f64 {          // 읽기 전용 메서드
        self.w * self.h
    }

    fn scale(&mut self, k: f64) {    // 수정하는 메서드
        self.w *= k;
        self.h *= k;
    }

    fn into_tuple(self) -> (f64, f64) { // self를 소비하는 메서드
        (self.w, self.h)
    }
}

fn main() {
    let mut r = Rect::new(2.0, 3.0);
    r.scale(2.0);                   // 자동으로 (&mut r).scale(2.0)
    println!("{}", r.area());       // 자동으로 (&r).area()
    let (w, h) = r.into_tuple();    // r은 여기서 이동됨
    println!("{w} {h} {:?}", Rect::square(1.0));
}
```

> [!cpp] **C++ 비교**
>
> | Rust 리시버 | C++ 대응 |
> |---|---|
> | `&self` | `void f() const` |
> | `&mut self` | `void f()` |
> | `self` | `void f() &&` (호출 후 객체를 쓸 수 없다는 점까지 강제) |
> | 없음 (`fn new()`) | `static` 멤버 함수 |
>
> 생성자는 없다. `new`는 관례적인 이름일 뿐 특별한 함수가 아니다. 실패할 수 있는 생성은 `fn new(...) -> Result<Self, E>`로 표현한다(5장).
> `this`는 암시적이지 않아서 필드 접근은 항상 `self.w`처럼 쓴다.

`impl` 블록은 여러 개로 나눌 수 있고, 다른 파일에 둘 수도 있다(같은 크레이트 안이라면).

## derive로 얻는 기본 기능

`#[derive(...)]`는 컴파일러가 트레이트 구현을 자동 생성하게 한다. C++20의 `= default` 비교 연산자와 비슷하다.

| derive | 기능 | C++ 대응 |
|---|---|---|
| `Debug` | `{:?}` 출력 | `operator<<` 직접 작성 |
| `Clone` | `.clone()` | 복사 생성자 |
| `Copy` | 암시적 비트 복사 (2장) | trivially copyable |
| `PartialEq`, `Eq` | `==`, `!=` | `operator==` (`= default`) |
| `PartialOrd`, `Ord` | `<`, `>`, 정렬 | `operator<=>` (`= default`) |
| `Hash` | `HashMap` 키로 사용 | `std::hash` 특수화 |
| `Default` | `Type::default()` | 기본 생성자 |

`Default`는 이름 있는 인자나 기본 인자가 없는 Rust에서 설정 구조체를 만들 때 특히 유용하다.

```rust
#[derive(Debug, Default)]
struct Config {
    verbose: bool,
    threads: usize,
    name: String,
}

let c = Config { threads: 8, ..Default::default() }; // 나머지는 false, 0, ""
```

## 열거형: 데이터를 품는 enum

```rust
enum Message {
    Quit,                         // 데이터 없음
    Move { x: i32, y: i32 },      // 이름 있는 필드
    Write(String),                // 튜플 형태
    ChangeColor(u8, u8, u8),
}

impl Message {
    fn describe(&self) -> String {
        match self {
            Message::Quit => "quit".to_string(),
            Message::Move { x, y } => format!("move to ({x}, {y})"),
            Message::Write(text) => format!("write {text}"),
            Message::ChangeColor(r, g, b) => format!("color #{r:02x}{g:02x}{b:02x}"),
        }
    }
}

fn main() {
    let msgs = [Message::Move { x: 1, y: 2 }, Message::Write("hi".into()), Message::Quit];
    for m in &msgs {
        println!("{}", m.describe());
    }
}
```

각 변형(variant)은 서로 다른 데이터를 가질 수 있고, 값은 항상 그중 **정확히 하나**다. 메모리 표현은 태그 + 가장 큰 변형 크기다.

> [!cpp] **C++ 비교**
>
> 같은 것을 C++로 쓰면 이렇다.
>
> ```cpp
> struct Quit {};
> struct Move { int x, y; };
> struct Write { std::string text; };
> using Message = std::variant<Quit, Move, Write>;
>
> std::visit(overloaded{
>     [](const Quit&) { /* ... */ },
>     [](const Move& m) { /* ... */ },
>     [](const Write& w) { /* ... */ },
> }, msg);
> ```
>
> Rust의 enum은 언어 기능이라 문법이 간결하고, `match`가 **모든 경우를 다뤘는지 컴파일러가 검사**한다. `std::get`이 던지는 `bad_variant_access` 같은 런타임 실패도 없다.

C 스타일 enum도 된다. `as`로 정수로 바꿀 수 있다.

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum Level { Low = 1, Mid = 5, High = 10 }

println!("{}", Level::Mid as i32); // 5
```

### Option: null 대신

표준 라이브러리의 `Option`은 평범한 enum이다.

```rust
enum Option<T> {
    None,
    Some(T),
}
```

값이 없을 수 있다는 사실이 **타입에 드러나고**, 꺼내려면 반드시 `None`을 처리해야 한다. 또한 `Option<&T>`, `Option<Box<T>>`는 null 포인터를 `None`으로 써서 **포인터와 크기가 같다**(niche 최적화). null을 없애는 데 비용이 들지 않는다.

```rust
use std::mem::size_of;
assert_eq!(size_of::<Option<&i32>>(), size_of::<&i32>());
assert_eq!(size_of::<Option<Box<i32>>>(), size_of::<Box<i32>>());
```

## match

`match`는 C++의 `switch`를 훨씬 강력하게 만든 것이다. 폴스루(fallthrough)가 없고, **모든 경우를 다뤄야 컴파일된다**(exhaustiveness).

```rust
fn classify(n: i32) -> &'static str {
    match n {
        i32::MIN..=-1 => "negative",
        0 => "zero",
        1 | 2 | 3 => "small",          // 여러 패턴
        x if x % 2 == 0 => "even",     // 가드(guard)
        _ => "odd",                    // 나머지 전부
    }
}
```

### 패턴 문법 요약

| 패턴 | 예 | 의미 |
|---|---|---|
| 리터럴 | `0`, `'a'`, `"hi"` | 값 비교 |
| 범위 | `1..=9`, `'a'..='z'` | 닫힌 범위 |
| 여러 개 | `A \| B` | 둘 중 하나 |
| 와일드카드 | `_` | 무엇이든, 바인딩 안 함 |
| 나머지 무시 | `Point { x, .. }`, `(first, ..)` | 나머지 필드/원소 무시 |
| 바인딩 | `n @ 1..=9` | 범위에 맞으면 값을 `n`에 바인딩 |
| 구조 분해 | `Some((a, b))`, `Move { x, y: 0 }` | 중첩 가능 |
| 가드 | `x if x > 0` | 추가 조건 |
| 슬라이스 | `[first, .., last]`, `[]` | 길이와 원소 매칭 |

```rust
fn describe(v: &[i32]) -> String {
    match v {
        [] => "empty".into(),
        [x] => format!("one: {x}"),
        [first, .., last] => format!("{first}..{last}"),
    }
}
```

### 참조를 match할 때

참조를 `match`하면 바인딩이 자동으로 **참조**가 된다(default binding modes). 그래서 소유권을 옮기지 않고 안을 들여다볼 수 있다.

```rust
let opt = Some(String::from("hi"));
match &opt {
    Some(s) => println!("{s}"),   // s: &String. 이동 없음
    None => {}
}
println!("{opt:?}");              // opt는 그대로
```

`match opt { Some(s) => ... }`라고 쓰면 `String`이 `s`로 **이동**하므로 이후 `opt`를 쓸 수 없다.

## if let, let else, while let

경우 하나만 관심 있을 때는 `match` 대신 짧은 문법을 쓴다.

```rust
let config_max: Option<u8> = Some(3);

// if let: 한 패턴만 처리
if let Some(max) = config_max {
    println!("max = {max}");
} else {
    println!("no max");
}

// let else: 매칭 실패 시 반드시 탈출(return/break/continue/panic)
fn parse_kv(s: &str) -> Option<(&str, &str)> {
    let Some((k, v)) = s.split_once('=') else {
        return None;
    };
    Some((k.trim(), v.trim()))
}

// while let: 매칭되는 동안 반복
let mut stack = vec![1, 2, 3];
while let Some(top) = stack.pop() {
    print!("{top} ");
}

// matches!: bool로 패턴 검사
let is_small = matches!(config_max, Some(0..=5));
```

`let else`는 "조건 안 맞으면 일찍 빠져나가기(early return)" 패턴을 들여쓰기 없이 표현한다. 아주 자주 쓴다.

## 흔한 컴파일 에러

```rust
fn f(m: Message) {
    match m {                       // error[E0004]: non-exhaustive patterns: `Message::Quit` not covered
        Message::Move { .. } => {}
        Message::Write(_) => {}
        Message::ChangeColor(..) => {}
    }
}
```

새 변형을 추가하면 처리하지 않은 모든 `match`가 E0004로 실패한다. 리팩터링할 때 고칠 곳을 컴파일러가 전부 알려 주는 셈이다. `_ =>`를 남발하면 이 장점을 잃으니 주의하자.

| 코드 | 메시지 | 원인 |
|---|---|---|
| E0004 | non-exhaustive patterns | `match`에서 빠진 경우가 있음 |
| E0063 | missing field `h` in initializer | 구조체 필드 초기화 누락 |
| E0277 | `Rect` doesn't implement `Debug` | `#[derive(Debug)]` 누락 |
| E0369 | binary operation `==` cannot be applied to type `Rect` | `#[derive(PartialEq)]` 누락 |
| E0599 | no method named `clone` found | `#[derive(Clone)]` 누락 |
| E0382 | use of moved value | `match opt`로 안의 값을 이동한 뒤 `opt` 사용 → `match &opt` |

## 정리

- 구조체 + `impl` 블록이 클래스를 대신한다. 리시버는 `&self`, `&mut self`, `self` 중 하나다.
- 생성자는 없고, `new` 같은 연관 함수를 관례로 쓴다. `Default`와 `..`로 기본값을 채운다.
- 공통 기능은 `#[derive(...)]`로 얻는다.
- enum은 데이터를 품는 합 타입이다. `Option`도 평범한 enum이며 null을 대신한다.
- `match`는 모든 경우를 강제로 다루게 한다. 한 경우만 볼 때는 `if let`, `let else`, `while let`을 쓴다.

## 연습문제

1. `Circle { r }`, `Rect { w, h }`, `Triangle { a, b, c }` 세 변형을 갖는 `enum Shape`를 정의하고 `fn area(&self) -> f64`를 구현하자. 삼각형은 헤론 공식을 쓰자.
2. 신호등 `enum Light { Red, Yellow, Green }`에 다음 상태를 반환하는 `fn next(self) -> Self`와 지속 시간(초)을 반환하는 `fn duration(&self) -> u32`를 구현하자.
3. `"move 3 4"`, `"write hello"`, `"quit"` 같은 문자열을 `Option<Message>`로 파싱하는 함수를 `let else`와 `match`로 작성하자.

<details>
<summary>정답</summary>

```rust
use std::f64::consts::PI;

enum Shape {
    Circle { r: f64 },
    Rect { w: f64, h: f64 },
    Triangle { a: f64, b: f64, c: f64 },
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { r } => PI * r * r,
            Shape::Rect { w, h } => w * h,
            Shape::Triangle { a, b, c } => {
                let s = (a + b + c) / 2.0;
                (s * (s - a) * (s - b) * (s - c)).sqrt()
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum Light { Red, Yellow, Green }

impl Light {
    fn next(self) -> Self {
        match self {
            Light::Red => Light::Green,
            Light::Green => Light::Yellow,
            Light::Yellow => Light::Red,
        }
    }

    fn duration(&self) -> u32 {
        match self {
            Light::Red => 30,
            Light::Yellow => 3,
            Light::Green => 25,
        }
    }
}

#[derive(Debug)]
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
}

fn parse(line: &str) -> Option<Message> {
    let mut parts = line.split_whitespace();
    let Some(cmd) = parts.next() else {
        return None;
    };
    match cmd {
        "quit" => Some(Message::Quit),
        "move" => {
            let x = parts.next()?.parse().ok()?; // ?는 5장에서 자세히 다룬다
            let y = parts.next()?.parse().ok()?;
            Some(Message::Move { x, y })
        }
        "write" => Some(Message::Write(parts.collect::<Vec<_>>().join(" "))),
        _ => None,
    }
}

fn main() {
    println!("{:.2}", Shape::Triangle { a: 3.0, b: 4.0, c: 5.0 }.area()); // 6.00
    let l = Light::Red.next();
    println!("{l:?} {}s", l.duration());
    println!("{:?}", parse("move 3 4"));
}
```

`match self`에서 `self`는 `&Shape`이므로 `r`, `w` 등은 `&f64`다. `&f64`끼리의 산술 연산은 표준 라이브러리에 정의되어 있어 `*`를 붙이지 않아도 된다.

</details>
