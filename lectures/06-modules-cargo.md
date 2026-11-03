---
title: 모듈, 크레이트, Cargo
order: 6
minutes: 25
---

C++의 헤더/소스 분리, `#include`, 네임스페이스, CMake, 패키지 매니저가 하던 일을 Rust에서는 **모듈 시스템**과 **Cargo**가 한다.
헤더 파일, include guard, ODR(One Definition Rule) 위반, 링크 순서 문제가 없다. 이 장에서는 코드를 나누고, 의존성을 쓰고, 테스트하는 방법을 본다.

## 용어: 패키지, 크레이트, 모듈

| 용어 | 의미 | C++ 대응 |
|---|---|---|
| 패키지(package) | `Cargo.toml` 하나로 관리되는 단위 | CMake 프로젝트 |
| 크레이트(crate) | **컴파일 단위**. 바이너리 또는 라이브러리 하나 | 실행 파일/라이브러리 타깃 |
| 모듈(module) | 크레이트 안의 이름공간 + 가시성 경계 | `namespace` (+ 헤더) |

- `src/main.rs`가 있으면 바이너리 크레이트, `src/lib.rs`가 있으면 라이브러리 크레이트다. 둘 다 있을 수 있다.
- `src/bin/*.rs`의 각 파일은 별도의 바이너리가 된다.
- C++은 **파일**이 번역 단위(translation unit)지만, Rust는 **크레이트 전체**가 컴파일 단위다. 그래서 선언 순서나 전방 선언이 필요 없다.

## 모듈 정의

모듈은 `mod`로 선언한다. 인라인으로 쓰거나 파일로 분리할 수 있다.

```rust
// src/main.rs
mod geometry {                   // 인라인 모듈
    pub struct Point {
        pub x: f64,
        pub y: f64,
    }

    pub fn distance(a: &Point, b: &Point) -> f64 {
        ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
    }
}

fn main() {
    let a = geometry::Point { x: 0.0, y: 0.0 };
    let b = geometry::Point { x: 3.0, y: 4.0 };
    println!("{}", geometry::distance(&a, &b));
}
```

파일로 분리할 때는 `mod 이름;`만 남기고 내용을 옮긴다. 컴파일러는 정해진 경로에서 파일을 찾는다.

```text
src/
├── main.rs          // mod net;  mod util;
├── util.rs          // util 모듈
├── net.rs           // net 모듈. 안에서 mod http; 선언
└── net/
    └── http.rs      // net::http 모듈
```

> [!warn] **주의**
>
> `mod foo;`는 C++의 `#include`가 아니라 "이 크레이트에 `foo` 모듈이 있다"는 **선언**이다. 각 파일은 크레이트 전체에서 정확히 한 번만 `mod`로 선언되어야 한다.
> 다른 모듈의 항목을 가져다 쓸 때는 `mod`가 아니라 `use`를 쓴다. 초보자가 가장 많이 헷갈리는 부분이다.

예전 방식인 `net/mod.rs`도 여전히 동작하지만, 요즘은 `net.rs` + `net/` 디렉터리를 권장한다.

## 가시성

모든 항목은 **기본이 비공개(private)** 다. 비공개 항목은 그 모듈과 자식 모듈에서만 보인다.

| 지정자 | 공개 범위 |
|---|---|
| (없음) | 현재 모듈과 그 하위 모듈 |
| `pub` | 어디서나 |
| `pub(crate)` | 현재 크레이트 안 |
| `pub(super)` | 부모 모듈 |

```rust
mod bank {
    pub struct Account {
        pub owner: String,
        balance: u64,            // 비공개 필드: 외부에서 직접 접근 불가
    }

    impl Account {
        pub fn new(owner: &str) -> Self {
            Self { owner: owner.to_string(), balance: 0 }
        }
        pub fn balance(&self) -> u64 {
            self.balance
        }
        pub fn deposit(&mut self, amount: u64) {
            self.balance += amount;
        }
    }
}

fn main() {
    let mut acc = bank::Account::new("kim");
    acc.deposit(100);
    println!("{} {}", acc.owner, acc.balance());
    // acc.balance = 1_000_000;    // error[E0616]: field `balance` of struct `Account` is private
    // let a = bank::Account { owner: "x".into(), balance: 0 }; // error[E0451]: 비공개 필드가 있으면 외부에서 생성 불가
}
```

> [!cpp] **C++ 비교**
>
> 가시성 경계가 **클래스가 아니라 모듈**이다. 같은 모듈 안의 함수는 구조체의 비공개 필드에 접근할 수 있다(C++의 `friend`가 필요 없다).
> 비공개 필드가 하나라도 있으면 외부에서 구조체 리터럴로 만들 수 없으므로, `new` 같은 생성 함수가 불변식(invariant)을 지키는 유일한 통로가 된다.
> 반면 `pub enum`의 변형은 자동으로 모두 공개다.

## use와 경로

```rust
use std::collections::HashMap;              // 항목 가져오기
use std::io::{self, Read, Write};           // 여러 개 + 모듈 자신(io)
use std::fmt::Result as FmtResult;          // 별칭 (이름 충돌 회피)

use crate::geometry::Point;                 // 크레이트 루트 기준 절대 경로
use super::helper;                          // 부모 모듈 기준
use self::inner::thing;                     // 현재 모듈 기준
```

- `crate::`는 현재 크레이트 루트, `super::`는 부모, `self::`는 현재 모듈이다.
- 외부 크레이트는 이름으로 바로 쓴다: `serde::Serialize`.
- 관례: 함수는 부모 모듈까지만 가져와 `io::stdin()`처럼 쓰고, 타입은 끝까지 가져와 `HashMap`처럼 쓴다.
- `pub use`는 **재수출(re-export)** 이다. 내부 구조와 다른 공개 API 경로를 만들 수 있다.

```rust
// src/lib.rs
mod shapes;                          // 내부 구조는 숨기고
pub use shapes::circle::Circle;      // 사용자는 mylib::Circle로 접근
```

`std`의 일부(`Vec`, `String`, `Option`, `Result`, `Box`, `println!` 등)는 **prelude**로 자동으로 가져와져 있어서 `use` 없이 쓸 수 있다.

## Cargo.toml과 의존성

```toml
[package]
name = "mytool"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }  # 기능(feature) 선택
anyhow = "1"                                     # "^1"과 같음: >=1.0.0, <2.0.0
rand = "0.9"                                     # >=0.9.0, <0.10.0
mylib = { path = "../mylib" }                    # 로컬 경로
fancy = { git = "https://github.com/user/fancy" } # git 저장소

[dev-dependencies]                               # 테스트/예제에서만 사용
criterion = "0.5"

[profile.release]
lto = true                                       # 링크 타임 최적화
codegen-units = 1
```

- 버전은 기본적으로 **SemVer 호환 범위**(caret)로 해석된다.
- `Cargo.lock`은 실제로 선택된 정확한 버전을 기록한다. 재현 가능한 빌드를 위해 커밋하자.
- 패키지는 [crates.io](https://crates.io)에서 찾고, 문서는 [docs.rs](https://docs.rs)에서 본다. 모든 공개 크레이트의 API 문서가 자동으로 올라간다.

```sh
cargo add serde --features derive   # 의존성 추가
cargo tree                          # 의존성 트리
cargo update                        # Cargo.lock 갱신 (호환 범위 안에서)
```

### 워크스페이스

여러 패키지를 하나의 저장소에서 관리할 때는 루트 `Cargo.toml`에 워크스페이스를 정의한다. `target/`과 `Cargo.lock`을 공유한다.

```toml
[workspace]
members = ["app", "core", "utils"]
resolver = "3"
```

## 조건부 컴파일

`#ifdef` 대신 `cfg` 속성을 쓴다. 전처리기가 아니라 문법 트리 단위로 동작하므로 매크로 오염이 없다.

```rust
#[cfg(target_os = "windows")]
fn home_dir() -> String { std::env::var("USERPROFILE").unwrap_or_default() }

#[cfg(not(target_os = "windows"))]
fn home_dir() -> String { std::env::var("HOME").unwrap_or_default() }

fn main() {
    if cfg!(debug_assertions) {      // 표현식 형태: debug 빌드에서 true
        println!("debug build");
    }
    println!("{}", home_dir());
}
```

Cargo의 `[features]`로 선택적 기능을 정의하고 `#[cfg(feature = "...")]`로 코드를 켜고 끌 수 있다.

## 테스트

테스트 프레임워크가 언어와 Cargo에 내장되어 있다. 별도 라이브러리(gtest 등)가 필요 없다.

```rust
// src/lib.rs
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]                 // cargo test 할 때만 컴파일
mod tests {
    use super::*;            // 부모 모듈의 항목(비공개 포함)을 가져옴

    #[test]
    fn adds() {
        assert_eq!(add(2, 3), 5);
        assert!(add(-1, 1) == 0, "sum should be zero");
    }

    #[test]
    #[should_panic(expected = "divide by zero")]
    fn panics() {
        panic!("divide by zero");
    }

    #[test]
    fn with_result() -> Result<(), String> {   // ?를 쓸 수 있는 테스트
        let n: i32 = "5".parse().map_err(|_| "parse failed")?;
        assert_eq!(n, 5);
        Ok(())
    }
}
```

- **단위 테스트**는 같은 파일의 `mod tests` 안에 둔다. 비공개 함수도 테스트할 수 있다.
- **통합 테스트**는 `tests/` 디렉터리에 둔다. 외부 사용자처럼 공개 API만 쓸 수 있다.
- **문서 테스트**: `///` 문서 주석 안의 코드 블록도 `cargo test`가 실행한다. 문서 예제가 낡지 않는다.

```rust
/// 두 수를 더한다.
///
/// ```
/// assert_eq!(mylib::add(1, 2), 3);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

```sh
cargo test                 # 전체
cargo test adds            # 이름에 "adds"가 포함된 테스트만
cargo test -- --nocapture  # 테스트 중 println! 출력 보기
```

## 흔한 컴파일 에러

| 코드 | 메시지 | 원인 |
|---|---|---|
| E0583 | file not found for module `foo` | `mod foo;`에 해당하는 `foo.rs`가 없음 (경로 확인) |
| E0433 | failed to resolve: use of unresolved module or unlinked crate | `use` 누락, 의존성 미추가, `mod` 선언 누락 |
| E0432 | unresolved import | `use` 경로가 틀림 (`crate::` 빠뜨림 등) |
| E0603 | function `foo` is private | `pub` 누락 |
| E0616 | field is private | 비공개 필드 접근 → getter 메서드 제공 |

## 정리

- 크레이트가 컴파일 단위이고, 모듈은 이름공간이자 가시성 경계다. 헤더는 없다.
- `mod`는 모듈을 **선언**하고, `use`는 이름을 **가져온다**.
- 모든 것은 기본 비공개다. `pub`, `pub(crate)`로 공개 범위를 정한다.
- Cargo가 의존성(crates.io), 빌드 프로필, 워크스페이스, 테스트를 모두 맡는다.
- `#[cfg(...)]`가 `#ifdef`를, `#[test]`와 `cargo test`가 테스트 프레임워크를 대신한다.

## 연습문제

1. `cargo new --lib shapes`로 라이브러리를 만들고, `src/circle.rs`와 `src/rect.rs`에 각각 `Circle`, `Rect` 구조체와 `area` 메서드를 넣자. `lib.rs`에서 `pub use`로 `shapes::Circle`, `shapes::Rect`로 접근할 수 있게 하자.
2. 1번의 각 `area`에 단위 테스트를 작성하고 `cargo test`로 실행하자. 부동소수점 비교는 `(a - b).abs() < 1e-9`를 쓰자.
3. `Rect`의 필드를 비공개로 바꾸고, 음수 크기를 거부하는 `fn new(w: f64, h: f64) -> Option<Rect>`를 추가하자. 외부에서 `Rect { w: -1.0, h: 1.0 }`을 만들 수 없는지 확인하자.

<details>
<summary>정답</summary>

```rust
// src/lib.rs
mod circle;
mod rect;

pub use circle::Circle;
pub use rect::Rect;
```

```rust
// src/circle.rs
pub struct Circle {
    pub r: f64,
}

impl Circle {
    pub fn area(&self) -> f64 {
        std::f64::consts::PI * self.r * self.r
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unit_circle() {
        assert!((Circle { r: 1.0 }.area() - std::f64::consts::PI).abs() < 1e-9);
    }
}
```

```rust
// src/rect.rs
pub struct Rect {
    w: f64,
    h: f64,
}

impl Rect {
    pub fn new(w: f64, h: f64) -> Option<Rect> {
        if w < 0.0 || h < 0.0 {
            return None;
        }
        Some(Rect { w, h })
    }

    pub fn area(&self) -> f64 {
        self.w * self.h
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn area() {
        assert!((Rect::new(2.0, 3.0).unwrap().area() - 6.0).abs() < 1e-9);
    }

    #[test]
    fn rejects_negative() {
        assert!(Rect::new(-1.0, 1.0).is_none());
    }
}
```

`tests/` 디렉터리의 통합 테스트에서 `shapes::Rect { w: -1.0, h: 1.0 }`을 쓰면 E0451(비공개 필드)로 컴파일되지 않는다.

</details>
