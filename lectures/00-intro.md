---
title: 소개와 환경 설정
order: 0
minutes: 20
---

이 강의는 C++을 충분히 다뤄 본 개발자가 Rust의 핵심을 기초부터 고급 주제까지 빠르게 익히는 것을 목표로 한다.
일반적인 프로그래밍 개념(변수, 함수, 포인터, 스택/힙 등)은 이미 안다고 가정하고, 대신 **"C++에서는 이렇게, Rust에서는 이렇게"** 비교에 집중한다.

각 챕터는 다음 순서로 구성된다.

1. 개념 설명 + C++ 비교
2. 예제 코드
3. 흔한 컴파일 에러
4. 정리와 연습문제

## Rust는 무엇을 해결하려 하는가

C++은 강력하지만, 다음 문제들을 **프로그래머의 규율**에 맡긴다.

| 문제 | C++에서의 현실 | Rust의 접근 |
|---|---|---|
| 댕글링 포인터/참조 | 런타임 UB, sanitizer로 찾음 | 빌림 검사기(borrow checker)가 컴파일 타임에 거부 |
| use-after-move | 컴파일됨 (moved-from 상태) | 이동 후 사용은 컴파일 에러 |
| 데이터 레이스 | UB, TSan으로 찾음 | `Send`/`Sync` 트레이트로 컴파일 타임에 거부 |
| 반복자 무효화 | UB | 공유 참조와 가변 참조를 동시에 허용하지 않아 원천 차단 |
| null 역참조 | UB | null 포인터 없음, `Option<T>` 사용 |
| 정수 오버플로 | signed는 UB | debug 빌드에서 panic, release에서 wrap (정의된 동작) |
| 빌드/패키지 관리 | CMake, vcpkg, conan… 제각각 | `cargo` 하나로 통일 |

핵심은 **safe Rust에는 정의되지 않은 동작(UB)이 없다**는 보장이다. 그러면서도 GC 없이, C++과 동급의 성능(zero-cost abstraction)을 낸다.
필요하면 `unsafe` 블록으로 C++ 수준의 저수준 제어를 할 수 있지만, 그 범위가 코드에서 명시적으로 드러난다(15장).

> [!cpp] **C++ 비교**
>
> Rust의 많은 규칙은 "모던 C++ 가이드라인을 컴파일러가 강제하는 것"으로 생각하면 이해가 쉽다.
> RAII, `unique_ptr`, move semantics, `const` 기본값, `std::optional`/`std::variant` 같은 아이디어가 언어의 기본 동작이 된다.

## 설치

[rustup](https://rustup.rs)으로 툴체인을 설치한다. rustup은 컴파일러 버전 관리자다(nvm, pyenv와 비슷).

- **Windows**: `rustup-init.exe`를 실행한다. MSVC 링커가 필요하므로 Visual Studio Build Tools("C++를 사용한 데스크톱 개발")가 설치되어 있어야 한다. C++ 개발자라면 대부분 이미 있다.
- **macOS / Linux**:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

설치 확인:

```sh
rustc --version
cargo --version
rustup update        # 최신 stable로 업데이트
```

설치되는 주요 도구:

| 도구 | 역할 | C++ 대응 |
|---|---|---|
| `rustc` | 컴파일러 | `g++`, `clang++`, `cl` |
| `cargo` | 빌드 시스템 + 패키지 매니저 + 테스트 러너 | CMake + vcpkg + ctest |
| `rustfmt` | 포매터 (`cargo fmt`) | clang-format |
| `clippy` | 린터 (`cargo clippy`) | clang-tidy |
| `rust-analyzer` | 언어 서버 (IDE 확장으로 설치) | clangd |

에디터는 VS Code + **rust-analyzer** 확장을 추천한다. 타입 추론 결과를 인라인으로 보여 줘서 학습에 큰 도움이 된다.
설치 없이 바로 실험하려면 [Rust Playground](https://play.rust-lang.org)를 쓰자.

## 첫 프로젝트

```sh
cargo new hello
cd hello
cargo run
```

생성되는 구조:

```text
hello/
├── Cargo.toml      # 프로젝트 매니페스트 (CMakeLists.txt + 의존성 목록)
└── src/
    └── main.rs     # 바이너리 크레이트의 진입점
```

`Cargo.toml`:

```toml
[package]
name = "hello"
version = "0.1.0"
edition = "2024"

[dependencies]
```

`edition`은 언어 "판(edition)"이다. C++의 `-std=c++20`과 비슷하지만, **에디션이 다른 크레이트끼리도 자유롭게 섞어 쓸 수 있다**는 점이 다르다. 이 강의는 2024 에디션을 기준으로 한다.

`src/main.rs`:

```rust
fn main() {
    println!("Hello, world!");
}
```

- `fn main()`: 진입점. 반환형이 없으면 `()`(unit, `void`에 해당)이다.
- `println!`: 끝의 `!`는 **매크로** 호출이라는 뜻이다. 포맷 문자열을 컴파일 타임에 검사하기 때문에 `printf`의 타입 불일치 같은 버그가 생기지 않는다.
- 헤더 파일이 없다. 선언과 정의가 분리되지 않고, 모듈 시스템이 이를 대신한다(6장).

## 자주 쓰는 cargo 명령

```sh
cargo check            # 타입 검사만 (가장 빠름, 작업 중 가장 많이 씀)
cargo build            # debug 빌드 → target/debug/
cargo build --release  # 최적화 빌드 → target/release/
cargo run              # 빌드 + 실행
cargo run -- arg1 arg2 # 프로그램에 인자 전달
cargo test             # 테스트 실행
cargo fmt              # 포맷팅
cargo clippy           # 린트
cargo doc --open       # 의존성 포함 문서 생성
cargo add serde        # 의존성 추가 (Cargo.toml 수정)
```

> [!tip] **팁**
>
> 개발 중에는 `cargo build`보다 `cargo check`를 자주 돌리자. 코드 생성을 건너뛰므로 훨씬 빠르다.
> 성능 측정은 반드시 `--release`로 해야 한다. debug 빌드는 C++의 `-O0`처럼 매우 느릴 수 있다.

## C++과 관점이 다른 점 한눈에 보기

| 항목 | C++ | Rust |
|---|---|---|
| 변수 기본값 | 가변 (`const`를 붙여야 불변) | **불변** (`mut`를 붙여야 가변) |
| 대입/인자 전달 | 기본이 **복사** | 기본이 **이동** (Copy 타입 제외) |
| 에러 처리 | 예외 | `Result<T, E>` 반환값 + `?` 연산자 |
| 다형성 | 상속 + virtual | 트레이트 (상속 없음) |
| 제네릭 | 템플릿 (덕 타이핑, 인스턴스화 시 검사) | 트레이트 바운드 (정의 시점에 검사) |
| null | 포인터는 null 가능 | 참조는 항상 유효, `Option<T>` |
| 오버로딩 | 함수 오버로딩 있음 | **없음** (트레이트나 다른 이름 사용) |
| 생성자 | 특수 멤버 함수 | 없음. 관례적으로 `new()` 연관 함수 |
| 암시적 변환 | 많음 | 거의 없음 (`as`, `From`/`Into`로 명시) |

## 컴파일러와 친해지기

Rust 컴파일러의 에러 메시지는 매우 친절하다. 처음에는 "컴파일러와 싸운다"고 느끼기 쉽지만, 대부분의 에러는 **C++이었다면 런타임 버그였을 것**이다.

```text
error[E0382]: borrow of moved value: `s`
 --> src/main.rs:4:20
  |
2 |     let s = String::from("hi");
  |         - move occurs because `s` has type `String`, which does not implement the `Copy` trait
3 |     let t = s;
  |             - value moved here
4 |     println!("{}", s);
  |                    ^ value borrowed here after move
```

에러 코드는 자세한 설명을 볼 수 있다.

```sh
rustc --explain E0382
```

## 정리

- Rust는 C++의 성능과 제어력을 유지하면서, 메모리/스레드 안전성을 **컴파일 타임에** 보장한다.
- `rustup`으로 설치하고, `cargo`가 빌드·의존성·테스트·포맷·린트를 모두 담당한다.
- 변수는 기본 불변, 대입은 기본 이동, 에러는 반환값으로 처리한다. 이 세 가지가 가장 큰 사고방식 전환이다.

## 연습문제

1. `cargo new hello`로 프로젝트를 만들고 `cargo run`, `cargo build --release`를 실행해 `target/` 아래에 생기는 디렉터리를 확인하자.
2. `main.rs`에 `println!("{}", 1 + );` 같은 문법 오류를 넣고 `cargo check`의 에러 메시지를 읽어 보자.
3. `cargo clippy`와 `cargo fmt`를 실행해 보자. 일부러 들여쓰기를 망가뜨린 뒤 `cargo fmt`가 고치는지 확인하자.

<details>
<summary>정답 / 힌트</summary>

1. `target/debug/hello(.exe)`와 `target/release/hello(.exe)`가 생긴다. `target/`은 CMake의 빌드 디렉터리와 같은 역할이며 `.gitignore`에 자동으로 들어가 있다.
2. 에러 메시지에 위치(`--> src/main.rs:2:24`)와 원인이 표시된다.
3. `cargo fmt`는 코드를 공식 스타일로 바꾼다. 대부분의 Rust 프로젝트는 이 스타일을 그대로 쓴다.

</details>
