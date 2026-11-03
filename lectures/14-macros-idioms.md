---
title: 매크로와 관용적 Rust
order: 14
minutes: 25
---

이 장은 두 부분이다. 먼저 `println!`, `vec!`, `#[derive]` 뒤에 있는 **매크로**를 보고, 이어서 Rust다운 코드를 쓰기 위한 **관용구(idiom)** 와 API 설계 관례를 정리한다.

## 선언적 매크로: macro_rules!

Rust 매크로는 텍스트 치환이 아니라 **문법 트리(토큰)를 다루는** 패턴 매칭이다.

```rust
macro_rules! square {
    ($x:expr) => {
        $x * $x
    };
}

fn main() {
    println!("{}", square!(1 + 2));   // 9
}
```

> [!cpp] **C++ 비교**
>
> `#define SQUARE(x) x * x`에 `1 + 2`를 넣으면 `1 + 2 * 1 + 2 = 5`가 된다. Rust의 `$x:expr`은 **하나의 식 노드**로 치환되므로 괄호 없이도 9가 나온다.
> 또한 매크로 안에서 만든 변수는 호출 측 변수와 섞이지 않는다(위생성, hygiene). 이름 충돌, 이중 평가 같은 전처리기 함정이 대부분 사라진다.

### 반복과 여러 규칙

```rust
use std::collections::HashMap;

macro_rules! hashmap {
    ($($k:expr => $v:expr),* $(,)?) => {{       // 0개 이상 반복, 마지막 쉼표 허용
        let mut m = HashMap::new();
        $( m.insert($k, $v); )*                  // 매칭된 개수만큼 펼침
        m
    }};
}

macro_rules! max {
    ($x:expr) => { $x };                          // 기저 사례
    ($x:expr, $($rest:expr),+) => {{              // 재귀
        let a = $x;
        let b = max!($($rest),+);
        if a > b { a } else { b }
    }};
}

fn main() {
    let ages = hashmap! { "kim" => 30, "lee" => 25, };
    println!("{:?} {}", ages.get("kim"), max!(3, 9, 4)); // Some(30) 9
}
```

| 조각 지정자 | 매칭 대상 |
|---|---|
| `expr` | 식 |
| `ident` | 식별자 (변수, 함수 이름) |
| `ty` | 타입 |
| `pat` | 패턴 |
| `literal` | 리터럴 |
| `block` | `{ ... }` 블록 |
| `tt` | 토큰 트리 하나 (무엇이든) |

반복은 `$( ... ),*`(0개 이상), `$( ... ),+`(1개 이상), `$( ... )?`(0 또는 1개)로 쓴다.

> [!tip] **팁**
>
> 함수나 제네릭으로 풀 수 있으면 매크로를 쓰지 말자. 매크로는 **가변 인자**, **반복적인 impl 생성**, **새로운 문법(DSL)** 처럼 함수로 안 되는 경우에만 쓴다. `cargo expand`(별도 설치)로 매크로가 펼쳐진 결과를 볼 수 있다.

## 절차적 매크로

절차적 매크로(procedural macro)는 **컴파일 타임에 실행되는 Rust 함수**로, 토큰을 받아 토큰을 만든다. 세 종류가 있다.

| 종류 | 모양 | 예 |
|---|---|---|
| derive | `#[derive(Serialize)]` | serde, thiserror, clap |
| 속성(attribute) | `#[tokio::main]` | tokio, 웹 프레임워크 라우팅 |
| 함수형 | `sqlx::query!("...")` | 컴파일 타임 SQL 검사 |

직접 만들려면 별도 크레이트(`proc-macro = true`)와 `syn`, `quote` 크레이트가 필요하다. 쓰는 것은 쉽고 만드는 일은 드물다.

### 대표 예: serde

`serde`는 Rust 직렬화의 사실상 표준이다. 데이터 구조와 형식(JSON, TOML, YAML, bincode 등)을 분리하고, derive로 코드를 생성한다.

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    name: String,
    port: u16,
    #[serde(default)]                       // 없으면 Default 값
    debug: bool,
    #[serde(rename = "allowedHosts")]       // JSON 키 이름 매핑
    allowed_hosts: Vec<String>,
}

fn main() -> Result<(), serde_json::Error> {
    let json = r#"{ "name": "api", "port": 8080, "allowedHosts": ["a.com"] }"#;
    let cfg: Config = serde_json::from_str(json)?;    // 타입 검증까지 한 번에
    println!("{cfg:?}");
    println!("{}", serde_json::to_string_pretty(&cfg)?);
    Ok(())
}
```

필드 타입이 맞지 않거나 필수 필드가 없으면 `from_str`이 위치 정보가 담긴 에러를 반환한다. 리플렉션 없이 컴파일 타임에 생성된 코드라 빠르다.

## 관용적 Rust

### 이름 규칙

| 대상 | 규칙 | 예 |
|---|---|---|
| 타입, 트레이트, enum 변형 | `UpperCamelCase` | `HttpClient`, `Some` |
| 함수, 메서드, 변수, 모듈 | `snake_case` | `read_to_string` |
| 상수, static | `SCREAMING_SNAKE_CASE` | `MAX_SIZE` |
| 라이프타임 | 짧은 소문자 | `'a`, `'src` |

변환 메서드 이름은 **비용**을 알려 준다.

| 접두사 | 비용 | 소유권 | 예 |
|---|---|---|---|
| `as_` | 공짜 | 빌림 → 빌림 | `as_str()`, `as_bytes()` |
| `to_` | 비쌈 (보통 할당) | 빌림 → 소유 | `to_string()`, `to_vec()` |
| `into_` | 대개 쌈 | 소유 → 소유 (소비) | `into_bytes()`, `into_iter()` |

생성 함수는 `new`, `with_capacity`, `from_*`, 그리고 `Default` 구현이 관례다. getter는 `get_` 없이 필드 이름 그대로(`fn len(&self)`) 쓴다.

### 유연한 인자 받기

```rust
use std::path::Path;

// &str, String, &String 모두 받기
fn greet(name: impl AsRef<str>) {
    println!("hi {}", name.as_ref());
}

// 소유가 필요하면 Into<String>: 호출 측이 이미 String이면 복사 없음
struct User { name: String }
impl User {
    fn new(name: impl Into<String>) -> Self {
        Self { name: name.into() }
    }
}

// 경로: &str, String, PathBuf, &Path 모두
fn file_size(p: impl AsRef<Path>) -> std::io::Result<u64> {
    Ok(std::fs::metadata(p)?.len())
}
```

반대로 **반환**은 구체적인 타입이나 `impl Iterator`처럼 정확하게 한다. "받을 때는 너그럽게, 돌려줄 때는 구체적으로."

### 빌더 패턴

이름 있는 인자와 기본 인자가 없으므로, 옵션이 많은 객체는 빌더로 만든다.

```rust
#[derive(Debug)]
struct Request {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    timeout_ms: u64,
}

struct RequestBuilder {
    req: Request,
}

impl RequestBuilder {
    fn new(url: impl Into<String>) -> Self {
        Self {
            req: Request { url: url.into(), method: "GET".into(), headers: vec![], timeout_ms: 30_000 },
        }
    }
    fn method(mut self, m: &str) -> Self { self.req.method = m.into(); self }
    fn header(mut self, k: &str, v: &str) -> Self { self.req.headers.push((k.into(), v.into())); self }
    fn timeout_ms(mut self, ms: u64) -> Self { self.req.timeout_ms = ms; self }
    fn build(self) -> Request { self.req }
}

fn main() {
    let req = RequestBuilder::new("https://example.com")
        .method("POST")
        .header("Content-Type", "application/json")
        .timeout_ms(5_000)
        .build();
    println!("{req:?}");
}
```

`self`를 값으로 받고 돌려주므로 체인이 자연스럽고, `build()` 이후에는 빌더를 다시 쓸 수 없다.

### 타입으로 실수 막기

- **뉴타입**: `struct UserId(u64)`, `struct Meters(f64)`로 같은 원시 타입끼리의 혼동을 막는다.
- **enum으로 상태 표현**: `bool` 플래그 여러 개 대신 `enum State { Idle, Running { pid: u32 }, Done(i32) }`. 불가능한 조합이 아예 표현되지 않는다.
- **소비하는 메서드로 상태 전이**: `fn connect(self) -> Connected`처럼 `self`를 받아 다른 타입을 반환하면, 이전 상태의 객체를 실수로 다시 쓸 수 없다(typestate 패턴).

### 피해야 할 것

| 안티패턴 | 대안 |
|---|---|
| 라이브러리 코드의 `unwrap()` | `Result` 반환, `?` |
| 빌림 검사기를 피하려는 무분별한 `clone()` | 구조 재설계, 짧은 빌림. 단 측정 전 최적화는 금물 |
| 모든 곳에 `Rc<RefCell<T>>` | 소유 구조를 트리로, 또는 인덱스/아레나 |
| 상속 흉내 (`Deref`로 부모 흉내) | 트레이트 + 합성(composition) |
| `&String`, `&Vec<T>` 인자 | `&str`, `&[T]` |
| 인덱스 루프 `for i in 0..v.len()` | 반복자, `enumerate()` |

### 도구

```sh
cargo fmt                     # 공식 스타일로 포맷
cargo clippy                  # 750개 이상의 린트: 비관용적 코드, 성능, 버그 의심
cargo clippy -- -W clippy::pedantic   # 더 엄격하게
cargo doc --open              # /// 문서 주석으로 HTML 문서 생성
```

`clippy`의 제안을 따라가는 것만으로도 관용구를 빠르게 익힐 수 있다. 공개 API는 [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)를 참고하자.

## 흔한 에러

| 메시지 | 원인 |
|---|---|
| no rules expected the token `...` | 매크로 호출이 어떤 규칙과도 맞지 않음 |
| cannot find macro `foo` in this scope | `macro_rules!`는 **정의 뒤에서만** 쓸 수 있음. 다른 모듈에서는 `#[macro_export]` 또는 `use` 필요 |
| recursion limit reached while expanding | 재귀 매크로의 기저 사례 누락 |
| cannot find derive macro `Serialize` | `serde`의 `derive` 기능 미활성화 |

## 정리

- `macro_rules!`는 토큰 패턴 매칭이다. 식 단위로 치환되고 위생적이라 C 전처리기 함정이 없다.
- 절차적 매크로(derive, 속성, 함수형)는 컴파일 타임 코드 생성이다. `serde`가 대표 예다.
- 이름은 `snake_case`/`UpperCamelCase`, 변환은 `as_`/`to_`/`into_`로 비용을 드러낸다.
- 인자는 `impl AsRef<str>`, `impl Into<String>`으로 너그럽게, 옵션이 많으면 빌더.
- 뉴타입과 enum으로 잘못된 상태를 표현 불가능하게 만든다. `clippy`를 습관화한다.

## 연습문제

1. `strings!["a", "b", "c"]`가 `Vec<String>`을 만들도록 매크로를 작성하자. 빈 호출과 마지막 쉼표도 허용하자.
2. `serde`로 `{"id": 1, "tags": ["x"], "owner": {"name": "kim"}}`를 중첩 구조체로 읽고, `tags`가 없으면 빈 `Vec`이 되게 하자.
3. `enum Connection { Disconnected, Connecting { attempts: u32 }, Connected { session: String } }`에 `fn on_event(self, ev: Event) -> Connection` 상태 전이 함수를 작성하자. `Event`는 `Connect`, `Success(String)`, `Fail`, `Drop` 네 가지다.

<details>
<summary>정답</summary>

```rust
macro_rules! strings {
    ($($s:expr),* $(,)?) => {
        vec![$($s.to_string()),*]
    };
}

#[derive(Debug)]
enum Connection {
    Disconnected,
    Connecting { attempts: u32 },
    Connected { session: String },
}

enum Event {
    Connect,
    Success(String),
    Fail,
    Drop,
}

impl Connection {
    fn on_event(self, ev: Event) -> Connection {
        match (self, ev) {
            (Connection::Disconnected, Event::Connect) => Connection::Connecting { attempts: 1 },
            (Connection::Connecting { .. }, Event::Success(s)) => Connection::Connected { session: s },
            (Connection::Connecting { attempts }, Event::Fail) if attempts < 3 => {
                Connection::Connecting { attempts: attempts + 1 }
            }
            (Connection::Connecting { .. }, Event::Fail) => Connection::Disconnected,
            (Connection::Connected { .. }, Event::Drop) => Connection::Disconnected,
            (state, _) => state,                // 그 밖의 이벤트는 무시
        }
    }
}

fn main() {
    let v: Vec<String> = strings!["a", "b", "c",];
    let empty: Vec<String> = strings![];
    println!("{v:?} {empty:?}");

    let c = Connection::Disconnected
        .on_event(Event::Connect)
        .on_event(Event::Fail)
        .on_event(Event::Success("s-1".into()));
    println!("{c:?}"); // Connected { session: "s-1" }
}
```

```rust
// 2 (serde, serde_json 의존성 필요)
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Owner {
    name: String,
}

#[derive(Debug, Deserialize)]
struct Item {
    id: u32,
    #[serde(default)]
    tags: Vec<String>,
    owner: Owner,
}

fn main() -> Result<(), serde_json::Error> {
    let a: Item = serde_json::from_str(r#"{"id": 1, "tags": ["x"], "owner": {"name": "kim"}}"#)?;
    let b: Item = serde_json::from_str(r#"{"id": 2, "owner": {"name": "lee"}}"#)?;
    println!("{a:?}\n{b:?}");
    Ok(())
}
```

</details>
