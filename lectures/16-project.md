---
title: 마무리 프로젝트와 다음 단계
order: 16
minutes: 25
---

마지막 장에서는 지금까지 배운 것을 묶어 작은 CLI 도구를 만든다. 파일(또는 표준 입력)의 단어 빈도를 세서 상위 N개를 표나 JSON으로 출력하는 `wordfreq`다.
그다음 C++ 개발자가 Rust를 계속 익히기 위한 자료와 생태계를 정리한다.

## 프로젝트: wordfreq

```sh
cargo new wordfreq
cd wordfreq
cargo add anyhow serde_json
cargo add clap --features derive
cargo add serde --features derive
```

```toml
[package]
name = "wordfreq"
version = "0.1.0"
edition = "2024"

[dependencies]
anyhow = "1"
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

구조는 **로직(lib.rs)과 입출력(main.rs)을 분리**한다. 로직은 테스트하기 쉽고, `main`은 얇게 유지한다.

```text
wordfreq/
├── Cargo.toml
└── src/
    ├── lib.rs      # Counter: 단어 세기, 정렬 (+ 단위 테스트)
    └── main.rs     # 인자 파싱, 파일 읽기, 출력
```

### src/lib.rs

```rust
use std::collections::HashMap;

#[derive(Debug, Default)]
pub struct Counter {
    counts: HashMap<String, usize>,
}

impl Counter {
    pub fn new() -> Self {
        Self::default()
    }

    /// 텍스트의 단어를 소문자로 세어 누적한다. 영숫자가 아닌 문자는 구분자로 본다.
    pub fn add_text(&mut self, text: &str) {
        for word in text.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()) {
            *self.counts.entry(word.to_lowercase()).or_insert(0) += 1;
        }
    }

    /// 다른 Counter의 결과를 합친다 (병렬 처리용).
    pub fn merge(&mut self, other: Counter) {
        for (word, count) in other.counts {
            *self.counts.entry(word).or_insert(0) += count;
        }
    }

    /// 빈도 내림차순, 같으면 단어 오름차순으로 상위 n개.
    pub fn top(&self, n: usize) -> Vec<(&str, usize)> {
        let mut v: Vec<(&str, usize)> = self.counts.iter().map(|(w, &c)| (w.as_str(), c)).collect();
        v.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        v.truncate(n);
        v
    }

    pub fn total(&self) -> usize {
        self.counts.values().sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_case_insensitive() {
        let mut c = Counter::new();
        c.add_text("Rust rust, RUST! C++ c");
        assert_eq!(c.top(2), vec![("rust", 3), ("c", 2)]);
        assert_eq!(c.total(), 5);
    }

    #[test]
    fn merge_adds_counts() {
        let mut a = Counter::new();
        a.add_text("a b");
        let mut b = Counter::new();
        b.add_text("b c");
        a.merge(b);
        assert_eq!(a.top(1), vec![("b", 2)]);
    }

    #[test]
    fn handles_unicode() {
        let mut c = Counter::new();
        c.add_text("러스트는 빠르다. 러스트는 안전하다.");
        assert_eq!(c.top(1), vec![("러스트는", 2)]);
    }
}
```

`top`이 `Vec<(&str, usize)>`를 반환한다는 점을 보자. 단어 문자열을 복사하지 않고 `Counter` 안의 `String`을 빌려준다. 생략 규칙(9장)에 따라 반환값은 `&self`에 묶이므로, 결과를 쓰는 동안 `Counter`를 수정할 수 없다는 것을 컴파일러가 보장한다.

### src/main.rs

```rust
use std::io;
use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;
use serde::Serialize;
use wordfreq::Counter;

/// Count word frequencies in files or stdin.
#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// Input files. Reads stdin when empty.
    files: Vec<PathBuf>,

    /// Number of words to show.
    #[arg(short = 'n', long, default_value_t = 10)]
    top: usize,

    /// Print JSON instead of a table.
    #[arg(long)]
    json: bool,
}

#[derive(Serialize)]
struct Entry<'a> {
    word: &'a str,
    count: usize,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let mut counter = Counter::new();

    if args.files.is_empty() {
        let text = io::read_to_string(io::stdin()).context("failed to read stdin")?;
        counter.add_text(&text);
    } else {
        for path in &args.files {
            let text = std::fs::read_to_string(path)
                .with_context(|| format!("failed to read {}", path.display()))?;
            counter.add_text(&text);
        }
    }

    let top = counter.top(args.top);
    if args.json {
        let entries: Vec<Entry> = top.iter().map(|&(word, count)| Entry { word, count }).collect();
        println!("{}", serde_json::to_string_pretty(&entries)?);
    } else {
        for (word, count) in &top {
            println!("{count:>8}  {word}");
        }
        println!("{:>8}  (total)", counter.total());
    }
    Ok(())
}
```

`/// 문서 주석`이 그대로 `--help` 출력이 된다. clap이 인자 파싱, 타입 변환, 에러 메시지, 도움말을 derive로 생성한다.

### 실행

```sh
cargo test                                   # 단위 테스트 3개
cargo run -- --help
cargo run -- src/lib.rs -n 5
cargo run -- src/*.rs --json
echo "a b a" | cargo run                     # 표준 입력
cargo run -- missing.txt                     # Error: failed to read missing.txt ... (anyhow 맥락 체인)
cargo build --release                        # target/release/wordfreq
cargo install --path .                       # ~/.cargo/bin에 설치
```

### 이 프로젝트에 쓰인 것

| 기능 | 장 |
|---|---|
| 소유권, `&str` 인자, 빌린 반환값 | 2, 3, 9 |
| 구조체 + `impl`, `derive(Default)` | 4 |
| `anyhow::Result`, `?`, `context` | 5 |
| lib/bin 분리, `cargo add`, 단위 테스트 | 6 |
| `HashMap` entry API, 유니코드 문자열 | 7 |
| `split` + `filter` + `map` + `collect`, 클로저 | 10 |
| `serde`, `clap` derive 매크로 | 14 |

## 확장 과제

1. **병렬 처리**: `rayon`을 추가하고 파일마다 `Counter`를 만들어 `merge`로 합치자. 힌트: `args.files.par_iter().map(...)`의 결과가 `Result<Counter>`이므로 `try_reduce(Counter::new, |mut a, b| { a.merge(b); Ok(a) })`를 쓸 수 있다.
2. **불용어**: `--stopwords <FILE>` 옵션으로 제외할 단어 목록을 받자. `HashSet<String>`을 쓴다.
3. **성능 측정**: 큰 파일(수백 MB)로 debug/release 속도를 비교하고, `to_lowercase()`의 할당을 줄여 보자(예: 이미 소문자면 할당하지 않기, `Cow<str>`).
4. **async 버전**: `tokio::fs`로 파일을 동시에 읽자. 그리고 이 문제에는 `rayon`과 async 중 무엇이 맞는지 생각해 보자.

<details>
<summary>힌트: 1번 병렬 처리</summary>

```rust
use rayon::prelude::*;

let counter = args
    .files
    .par_iter()
    .map(|path| -> Result<Counter> {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let mut c = Counter::new();
        c.add_text(&text);
        Ok(c)
    })
    .try_reduce(Counter::new, |mut a, b| {
        a.merge(b);
        Ok(a)
    })?;
```

4번: 파일 읽기는 I/O지만 단어 세기는 CPU 작업이고 파일 수도 많지 않다. 이런 경우는 `rayon`이 더 단순하고 빠르다. async는 동시 연결이 수천 개인 네트워크 작업에서 빛난다.

</details>

## C++ 개발자를 위한 사고방식 체크리스트

| C++ 습관 | Rust에서는 |
|---|---|
| 일단 포인터/참조를 저장해 둔다 | 소유하는 값을 저장하고, 참조는 짧게 빌린다 |
| 클래스 계층과 가상 함수 | enum(닫힌 집합) 또는 트레이트(열린 집합) |
| 예외로 에러 전파 | `Result` + `?` |
| null로 "없음" 표현 | `Option` |
| 생성자에서 불변식 확립 | `new() -> Result<Self, E>` + 비공개 필드 |
| 뮤텍스와 데이터를 따로 관리 | `Mutex<T>`가 데이터를 품는다 |
| 헤더/빌드 시스템/패키지 매니저 조합 | `cargo` 하나 |
| 템플릿 덕 타이핑 | 트레이트 바운드 |
| 빌림 검사기와 싸운다 | 데이터 구조(소유 관계)를 다시 설계한다 |

## 다음 단계

### 읽을거리

| 자료 | 내용 |
|---|---|
| [The Rust Programming Language](https://doc.rust-lang.org/book/) | 공식 입문서. 이 강의에서 다룬 내용을 더 자세히 |
| [Rust by Example](https://doc.rust-lang.org/rust-by-example/) | 예제 중심 레퍼런스 |
| [Rustlings](https://github.com/rust-lang/rustlings) | 컴파일 에러를 고치며 배우는 소규모 연습문제 |
| [Effective Rust](https://www.lurklurk.org/effective-rust/) | C++ 경험자를 염두에 둔 관용구 모음 |
| [Rust Atomics and Locks](https://marabos.nl/atomics/) | 동시성, 메모리 순서, 락 구현 (무료 온라인) |
| [Tokio 튜토리얼](https://tokio.rs/tokio/tutorial) | async 실전 |
| [The Rustonomicon](https://doc.rust-lang.org/nomicon/) | unsafe의 깊은 곳 |
| [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) | 라이브러리 API 설계 관례 |
| [std 문서](https://doc.rust-lang.org/std/) | 표준 라이브러리. 소스 링크로 구현까지 볼 수 있다 |

### 분야별 대표 크레이트

| 분야 | 크레이트 |
|---|---|
| 에러 처리 | `anyhow`, `thiserror` |
| 직렬화 | `serde`, `serde_json`, `toml` |
| CLI | `clap` |
| async 런타임 | `tokio` |
| 웹 서버 / HTTP 클라이언트 | `axum` / `reqwest` |
| 데이터베이스 | `sqlx`, `diesel` |
| 로깅, 트레이싱 | `tracing`, `tracing-subscriber` |
| 데이터 병렬 | `rayon` |
| 테스트, 벤치마크 | `proptest`, `criterion` |
| GUI / 게임 | `egui`, `bevy` |
| 임베디드 | `embassy`, `embedded-hal` |
| WebAssembly | `wasm-bindgen` |
| C++ / Python 연동 | `cxx` / `pyo3` |

크레이트를 고를 때는 [lib.rs](https://lib.rs)나 crates.io의 다운로드 수, 최근 업데이트, 문서 품질을 본다.

### 추천 연습 방법

1. **익숙한 C++ 도구 하나를 Rust로 다시 짜 보자.** 같은 문제를 두 언어로 풀면 설계 차이가 가장 잘 보인다.
2. **`cargo clippy -- -W clippy::pedantic`의 제안을 모두 읽어 보자.** 관용구를 빠르게 익힐 수 있다.
3. **좋아하는 크레이트의 소스를 읽자.** docs.rs의 `source` 링크로 바로 볼 수 있다.
4. **기존 C++ 프로젝트에 작은 Rust 모듈을 붙여 보자.** 15장의 FFI나 `cxx`로 시작한다.

## 정리

- 로직(lib)과 입출력(main)을 나누고, 로직에 단위 테스트를 붙인다.
- `clap` + `anyhow` + `serde`는 CLI 도구의 표준 조합이다.
- 빌린 반환값, entry API, 반복자 체인처럼 이 강의의 개념들이 작은 프로그램에서도 자연스럽게 쓰인다.
- 다음 단계는 공식 Book과 Rustlings로 빈틈을 메우고, 실제 도구를 Rust로 만들어 보는 것이다.

수고했다. 이제 컴파일러와 싸우는 대신 대화할 수 있을 것이다. 🦀
