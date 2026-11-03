---
title: 에러 처리 (Option, Result, ?)
order: 5
minutes: 35
---

Rust에는 예외(exception)가 없다. 에러는 두 종류로 나뉜다.

- **복구 불가능한 에러**: 버그다. `panic!`으로 즉시 중단한다.
- **복구 가능한 에러**: 파일 없음, 파싱 실패 같은 예상 가능한 실패다. `Result<T, E>`를 **반환값**으로 돌려준다.

에러가 함수 시그니처에 드러나므로 "이 함수가 무엇을 던지는지" 문서를 뒤질 필요가 없고, 처리하지 않으면 컴파일러가 경고한다.

## panic: 버그일 때

```rust
fn main() {
    let v = vec![1, 2, 3];
    let i = 10;
    // v[i];                       // panic: index out of bounds
    // let x: Option<i32> = None;
    // x.unwrap();                 // panic: called `Option::unwrap()` on a `None` value
    if i >= v.len() {
        panic!("index {i} is out of range");
    }
}
```

- panic은 기본적으로 스택을 되감으며(unwind) 지역 변수를 drop하고 스레드를 끝낸다. 메인 스레드라면 프로그램이 종료된다.
- `Cargo.toml`의 `[profile.release]`에 `panic = "abort"`를 주면 되감기 없이 즉시 중단한다. 바이너리가 작아진다.
- panic을 제어 흐름으로 쓰지 않는다. `catch_unwind`가 있지만 FFI 경계 같은 특수한 용도다.

> [!cpp] **C++ 비교**
>
> panic은 `assert`나 `std::terminate`에 가깝고, `Result`는 C++23의 `std::expected<T, E>`에 해당한다. `Option`은 `std::optional`이다.
> 차이는 Rust 생태계 **전체가** 이 방식을 쓴다는 점, 그리고 `?` 연산자로 전파가 한 글자라는 점이다.

## Result

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

```rust
use std::fs;

fn main() {
    match fs::read_to_string("config.txt") {
        Ok(text) => println!("{} bytes", text.len()),
        Err(e) => eprintln!("failed: {e}"),
    }
}
```

`Result`에는 `#[must_use]`가 붙어 있어서, 반환된 `Result`를 무시하면 경고가 난다. 에러를 조용히 삼키기 어렵게 만든 설계다.

### 꺼내는 방법

| 메서드 | 동작 | 언제 |
|---|---|---|
| `match`, `if let` | 직접 분기 | 기본 |
| `unwrap()` | `Err`면 panic | 프로토타입, 테스트 |
| `expect("msg")` | `Err`면 메시지와 함께 panic | "절대 실패하지 않는다"는 근거가 있을 때 |
| `unwrap_or(v)` | `Err`면 `v` | 기본값이 있을 때 |
| `unwrap_or_else(f)` | `Err`면 `f(e)` 호출 | 기본값 계산이 비쌀 때 |
| `unwrap_or_default()` | `Err`면 `T::default()` | |
| `?` | `Err`면 호출자에게 반환 | **대부분의 경우** |

## ? 연산자: 에러 전파

```rust
use std::fs;
use std::io;

fn read_first_line(path: &str) -> Result<String, io::Error> {
    let text = fs::read_to_string(path)?;          // Err면 즉시 return Err(e)
    let line = text.lines().next().unwrap_or("");
    Ok(line.to_string())
}
```

`expr?`는 대략 다음과 같이 펼쳐진다.

```rust
match expr {
    Ok(v) => v,
    Err(e) => return Err(From::from(e)),   // From으로 에러 타입 변환까지 해 줌
}
```

- `?`는 **`Result`나 `Option`을 반환하는 함수 안에서만** 쓸 수 있다.
- `From::from(e)` 덕분에 하위 에러를 상위 에러 타입으로 자동 변환할 수 있다(아래 커스텀 에러 참고).
- 메서드 체인과 잘 어울린다: `fs::read_to_string(p)?.trim().parse::<i32>()`

`main`도 `Result`를 반환할 수 있다. `Err`를 반환하면 에러를 출력하고 종료 코드 1로 끝난다.

```rust
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    let n: i32 = "42".parse()?;     // ParseIntError → Box<dyn Error>로 자동 변환
    let text = std::fs::read_to_string("config.txt")?; // io::Error도 마찬가지
    println!("{n} {}", text.len());
    Ok(())
}
```

`Box<dyn Error>`는 "어떤 에러든"을 담는 트레이트 객체다(8장). 간단한 프로그램에서는 이것으로 충분하다.

## Option 다루기

`Option`도 `?`를 지원한다. `Option`을 반환하는 함수에서 `None`이면 즉시 `None`을 반환한다.

```rust
fn first_char_upper(s: &str) -> Option<char> {
    let c = s.chars().next()?;            // 빈 문자열이면 None 반환
    c.to_uppercase().next()
}
```

자주 쓰는 조합자(combinator):

```rust
let name: Option<&str> = Some("rust");

let len = name.map(|s| s.len());                   // Some(4)
let upper = name.map(str::to_uppercase);           // Some("RUST")
let n = name.and_then(|s| s.parse::<i32>().ok()); // None (파싱 실패)
let s = name.unwrap_or("default");                 // "rust"
let r: Result<&str, String> = name.ok_or("missing".to_string()); // Option → Result
let o: Option<i32> = "7".parse().ok();             // Result → Option
let filtered = name.filter(|s| s.len() > 10);      // None

let mut slot = Some(3);
let taken = slot.take();                           // slot = None, taken = Some(3)
```

`Result`에도 `map`, `map_err`, `and_then`, `ok()`, `unwrap_or_else` 등 같은 이름의 메서드가 있다. 이름 규칙이 일관적이라 한 번 익히면 둘 다 쓸 수 있다.

## 커스텀 에러 타입

라이브러리는 호출자가 에러 종류별로 분기할 수 있도록 **구체적인 에러 enum**을 제공하는 게 좋다.

```rust
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
enum ConfigError {
    Missing(String),
    BadNumber(ParseIntError),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ConfigError::Missing(key) => write!(f, "missing key: {key}"),
            ConfigError::BadNumber(e) => write!(f, "bad number: {e}"),
        }
    }
}

impl std::error::Error for ConfigError {}

// ?가 ParseIntError를 ConfigError로 자동 변환하게 해 줌
impl From<ParseIntError> for ConfigError {
    fn from(e: ParseIntError) -> Self {
        ConfigError::BadNumber(e)
    }
}

fn get_port(line: &str) -> Result<u16, ConfigError> {
    let Some(value) = line.strip_prefix("port=") else {
        return Err(ConfigError::Missing("port".into()));
    };
    Ok(value.trim().parse()?)          // ParseIntError → ConfigError (From)
}
```

보일러플레이트가 많다. 실무에서는 다음 두 크레이트를 쓴다.

### thiserror: 라이브러리용

```toml
[dependencies]
thiserror = "2"
```

```rust
use thiserror::Error;

#[derive(Debug, Error)]
enum ConfigError {
    #[error("missing key: {0}")]
    Missing(String),
    #[error("bad number: {0}")]
    BadNumber(#[from] std::num::ParseIntError),   // From 구현까지 생성
    #[error("io error")]
    Io(#[from] std::io::Error),
}
```

위의 `Display`, `Error`, `From` 구현을 매크로가 전부 생성한다.

### anyhow: 애플리케이션용

```toml
[dependencies]
anyhow = "1"
```

```rust
use anyhow::{bail, Context, Result};

fn load_port(path: &str) -> Result<u16> {       // anyhow::Result<T> = Result<T, anyhow::Error>
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {path}"))?;  // 에러에 맥락 추가
    let port: u16 = text.trim().parse().context("port is not a number")?;
    if port < 1024 {
        bail!("port {port} is reserved");       // return Err(anyhow!(...))
    }
    Ok(port)
}

fn main() -> Result<()> {
    let port = load_port("port.txt")?;
    println!("{port}");
    Ok(())
}
```

`anyhow::Error`는 어떤 에러든 담고, `context`로 쌓은 맥락을 체인으로 출력한다. 에러 종류별로 분기할 필요가 없는 **최종 애플리케이션**에 적합하다.

> [!tip] **팁**
>
> 경험칙: **라이브러리는 `thiserror`, 애플리케이션은 `anyhow`**. 라이브러리가 `anyhow::Error`를 반환하면 호출자가 에러 종류를 구분하기 어렵다.

## 흔한 컴파일 에러

```rust
fn main() {
    let n: i32 = "42".parse()?;   // error[E0277]: the `?` operator can only be used in a function that returns `Result` or `Option`
}
```

```rust
fn parse(s: &str) -> Result<i32, String> {
    Ok(s.parse::<i32>()?)         // error[E0277]: `?` couldn't convert the error to `String`
}                                 // 해결: .map_err(|e| e.to_string())?
```

```rust
fn get(v: &[i32]) -> i32 {
    v.first()                     // error[E0308]: expected `i32`, found `Option<&i32>`
}                                 // 해결: v.first().copied().unwrap_or(0)
```

```text
warning: unused `Result` that must be used
```

`Result`를 무시했을 때 나는 경고다. 정말 무시하려면 `let _ = f();`로 의도를 드러내자.

## 정리

- 버그는 `panic!`, 예상 가능한 실패는 `Result<T, E>`로 반환한다. 예외는 없다.
- `?`는 에러를 호출자에게 전파하고, `From`으로 에러 타입을 자동 변환한다.
- `Option`과 `Result`는 `map`, `and_then`, `unwrap_or`, `ok_or`, `ok` 같은 조합자로 다룬다.
- `unwrap`/`expect`는 프로토타입, 테스트, 또는 실패할 수 없음을 아는 곳에서만 쓴다.
- 라이브러리는 `thiserror`로 구체적인 에러 enum을, 애플리케이션은 `anyhow`로 맥락 있는 에러를 쓴다.

## 연습문제

1. 문자열 슬라이스 목록 `&[&str]`을 받아 모두 `i32`로 파싱해 합계를 반환하는 `fn sum_all(items: &[&str]) -> Result<i32, std::num::ParseIntError>`를 `?`로 작성하자.
2. 1번을 수정해, 실패하면 몇 번째 항목이 문제였는지 담은 `String` 에러를 반환하게 해라(`map_err` 사용).
3. `"name=kim"`, `"age=30"` 두 줄짜리 텍스트에서 `(String, u32)`를 뽑는 함수를 `anyhow`로 작성하고, 키가 없거나 숫자가 아니면 맥락 있는 에러를 반환하자.

<details>
<summary>정답</summary>

```rust
use std::num::ParseIntError;

// 1
fn sum_all(items: &[&str]) -> Result<i32, ParseIntError> {
    let mut sum = 0;
    for s in items {
        sum += s.trim().parse::<i32>()?;
    }
    Ok(sum)
    // 또는: items.iter().map(|s| s.trim().parse::<i32>()).sum()
    //       (Result를 모으는 sum은 첫 에러에서 멈춘다. 10장)
}

// 2
fn sum_all2(items: &[&str]) -> Result<i32, String> {
    let mut sum = 0;
    for (i, s) in items.iter().enumerate() {
        sum += s.trim().parse::<i32>().map_err(|e| format!("item {i} ({s:?}): {e}"))?;
    }
    Ok(sum)
}

fn main() {
    println!("{:?}", sum_all(&["1", "2", "3"]));     // Ok(6)
    println!("{:?}", sum_all2(&["1", "x", "3"]));    // Err("item 1 (\"x\"): invalid digit found in string")
}
```

```rust
// 3 (Cargo.toml: anyhow = "1")
use anyhow::{Context, Result};

fn parse_person(text: &str) -> Result<(String, u32)> {
    let mut name = None;
    let mut age = None;
    for line in text.lines() {
        match line.split_once('=') {
            Some(("name", v)) => name = Some(v.to_string()),
            Some(("age", v)) => age = Some(v.parse::<u32>().with_context(|| format!("bad age: {v}"))?),
            _ => {}
        }
    }
    Ok((name.context("missing name")?, age.context("missing age")?))
}
```

`anyhow`의 `context`는 `Option`에도 쓸 수 있어서 `None`을 맥락 있는 에러로 바꿔 준다.

</details>
