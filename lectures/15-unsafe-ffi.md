---
title: unsafe와 FFI
order: 15
minutes: 35
---

컴파일러가 증명할 수 없지만 프로그래머는 안전하다고 아는 코드가 있다. 하드웨어 접근, C 라이브러리 호출, 고성능 자료구조의 내부 구현 등이다.
`unsafe`는 이런 코드를 위한 탈출구다. 핵심은 **unsafe 코드를 작게 가두고, 그 위에 안전한 API를 씌우는 것**이다. 표준 라이브러리의 `Vec`, `split_at_mut`, `Mutex`가 모두 이렇게 만들어져 있다.

## unsafe가 허락하는 것

`unsafe` 블록 안에서만 할 수 있는 일은 다섯 가지뿐이다.

1. 원시 포인터(raw pointer) 역참조
2. `unsafe fn` 호출 (FFI 함수 포함)
3. `static mut` 변수 접근
4. `unsafe trait` 구현 (`Send`, `Sync` 등)
5. `union` 필드 읽기

빌림 검사, 타입 검사, 범위 검사는 `unsafe` 안에서도 **그대로 동작한다**. `unsafe`는 "규칙을 끈다"가 아니라 "컴파일러가 확인 못 하는 몇 가지를 **내가** 보장한다"는 서명이다.

> [!cpp] **C++ 비교**
>
> C++은 전체가 암묵적으로 `unsafe` 블록이라고 볼 수 있다. Rust에서는 위험한 코드가 `unsafe` 키워드로 **검색 가능**하고, 코드 리뷰와 감사(audit)를 그 부분에 집중할 수 있다.

## 원시 포인터

```rust
fn main() {
    let mut x = 10;
    let p_const: *const i32 = &raw const x;   // 원시 포인터 만들기는 안전
    let p_mut: *mut i32 = &raw mut x;

    unsafe {
        *p_mut += 1;                           // 역참조는 unsafe
        println!("{}", *p_const);              // 11
    }

    let addr = 0x1234usize as *const i32;      // 임의 주소도 만들 수는 있다
    let _ = addr;                              // 역참조하면 UB
}
```

| | 참조 `&T`, `&mut T` | 원시 포인터 `*const T`, `*mut T` |
|---|---|---|
| null | 불가 | 가능 (`ptr::null()`, `is_null()`) |
| 댕글링 | 불가 | 가능 |
| 빌림 규칙 | 적용 | 적용 안 됨 (별칭 자유) |
| 자동 해제 | — | 없음 |
| 산술 | — | `add`, `offset`, `sub` |

원시 포인터 ↔ 참조 변환: `&x as *const T`는 안전하고, `&*ptr`이나 `ptr.as_ref()`(null이면 `None`)는 unsafe다.

## 안전한 추상화 만들기

3장에서 본 `split_at_mut`를 직접 만들어 보자. 빌림 검사기는 한 슬라이스에서 가변 참조 두 개를 꺼내는 것을 허락하지 않지만, 두 구간이 겹치지 않는다는 것은 우리가 안다.

```rust
use std::slice;

fn split_at_mut(v: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = v.len();
    assert!(mid <= len);                      // 전제 조건을 런타임에 확인
    let ptr = v.as_mut_ptr();
    // SAFETY: mid <= len이므로 두 구간은 모두 v 안에 있고 서로 겹치지 않는다.
    // 반환값의 라이프타임은 v에 묶여 있어 v보다 오래 살 수 없다.
    unsafe {
        (
            slice::from_raw_parts_mut(ptr, mid),
            slice::from_raw_parts_mut(ptr.add(mid), len - mid),
        )
    }
}

fn main() {
    let mut a = [1, 2, 3, 4, 5];
    let (l, r) = split_at_mut(&mut a, 2);
    l[0] = 100;
    r[0] = 300;
    println!("{a:?}");                       // [100, 2, 300, 4, 5]
}
```

- 함수 시그니처는 **안전**하다. 어떤 입력을 줘도 UB가 생기지 않도록 `assert!`로 막았다.
- `// SAFETY:` 주석으로 **왜 안전한지** 적는 것이 관례다(clippy 린트도 있다).
- 이 불변식을 지키지 못하는 함수라면 `unsafe fn`으로 선언하고 문서에 `# Safety` 절을 써서 호출자에게 책임을 넘긴다.

```rust
/// # Safety
/// `i`는 `v.len()`보다 작아야 한다.
unsafe fn get_fast(v: &[i32], i: usize) -> i32 {
    // 2024 에디션: unsafe fn 안에서도 unsafe 연산은 unsafe 블록으로 감싸야 한다
    unsafe { *v.get_unchecked(i) }
}
```

## Rust에서의 UB

unsafe 코드가 지켜야 할 규칙은 C++보다 **엄격한** 부분이 있다.

- 댕글링, 정렬되지 않은(unaligned), null 포인터 역참조
- 데이터 레이스
- **별칭 규칙 위반**: `&mut T`가 살아 있는 동안 같은 메모리를 가리키는 다른 참조가 쓰이면 UB. 컴파일러가 `&mut`에 `noalias`를 붙여 최적화하기 때문이다(C의 `restrict`가 기본값인 셈).
- **잘못된 값 만들기**: `bool`에 2, 범위 밖 enum 판별값, UTF-8이 아닌 `str`, null 참조, 초기화되지 않은 정수. 만드는 것만으로 UB다. 초기화 전 메모리는 `MaybeUninit<T>`로 다룬다.

> [!tip] **팁**
>
> **Miri**는 Rust의 UB 검출 인터프리터다. `rustup +nightly component add miri` 후 `cargo +nightly miri test`로 unsafe 코드의 테스트를 돌리면 별칭 위반, 범위 밖 접근, 누수까지 잡아 준다. sanitizer보다 정밀하다.

`static mut`은 2024 에디션에서 참조를 만드는 것 자체가 에러다(`static_mut_refs`). 전역 가변 상태는 아토믹, `Mutex`, `OnceLock`을 쓰자.

## FFI: Rust에서 C 호출하기

```rust
use std::ffi::{c_char, CString};

unsafe extern "C" {                        // 2024 에디션: extern 블록은 unsafe extern
    fn abs(x: i32) -> i32;
    fn strlen(s: *const c_char) -> usize;
    safe fn llabs(x: i64) -> i64;          // 안전하다고 선언하면 unsafe 없이 호출 가능
}

fn main() {
    let s = CString::new("hello").unwrap(); // NUL 종료 문자열 (내부에 NUL이 있으면 Err)
    unsafe {
        println!("{} {}", abs(-3), strlen(s.as_ptr()));
    }
    println!("{}", llabs(-5));
}
```

C 표준 라이브러리는 이미 링크되어 있어서 선언만 하면 된다. 내 C/C++ 코드는 `build.rs`에서 `cc` 크레이트로 컴파일해 링크한다.

```toml
[build-dependencies]
cc = "1"
```

```c
// csrc/vecmath.c
#include <stddef.h>
#include <stdint.h>

int32_t dot(const int32_t* a, const int32_t* b, size_t n) {
    int32_t s = 0;
    for (size_t i = 0; i < n; ++i) s += a[i] * b[i];
    return s;
}
```

```rust
// build.rs (패키지 루트): cargo build 전에 실행되는 빌드 스크립트
fn main() {
    cc::Build::new().file("csrc/vecmath.c").compile("vecmath");
    // C++이면: cc::Build::new().cpp(true).file("csrc/x.cpp").compile("x");
    println!("cargo::rerun-if-changed=csrc/vecmath.c");
}
```

```rust
// src/main.rs
unsafe extern "C" {
    fn dot(a: *const i32, b: *const i32, n: usize) -> i32;
}

/// 안전한 래퍼: 길이 검사를 Rust 쪽에서 강제한다
pub fn safe_dot(a: &[i32], b: &[i32]) -> i32 {
    assert_eq!(a.len(), b.len());
    // SAFETY: 두 슬라이스는 n개 원소에 대해 유효하고, dot은 읽기만 한다.
    unsafe { dot(a.as_ptr(), b.as_ptr(), a.len()) }
}

fn main() {
    println!("{}", safe_dot(&[1, 2, 3], &[4, 5, 6])); // 32
}
```

헤더가 크면 `bindgen`으로 C 헤더에서 `extern` 선언을 자동 생성한다.

## FFI: C에서 Rust 호출하기

```toml
[lib]
crate-type = ["cdylib"]        # .so/.dll/.dylib. 정적 라이브러리는 "staticlib"
```

```rust
use std::ffi::{c_char, CStr, CString};

#[repr(C)]                                  // C와 같은 메모리 배치
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[unsafe(no_mangle)]                        // 2024 에디션 표기. 심볼 이름을 그대로 노출
pub extern "C" fn rr_point_len(p: *const Point) -> f64 {
    // SAFETY: 호출자가 유효한 Point 포인터 또는 null을 넘긴다고 문서화했다.
    let Some(p) = (unsafe { p.as_ref() }) else {
        return 0.0;
    };
    (p.x * p.x + p.y * p.y).sqrt()
}

#[unsafe(no_mangle)]
pub extern "C" fn rr_greet(name: *const c_char) -> *mut c_char {
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy();
    CString::new(format!("hello, {name}")).unwrap().into_raw() // 소유권을 C로 넘김
}

#[unsafe(no_mangle)]
pub extern "C" fn rr_free_string(s: *mut c_char) {
    if !s.is_null() {
        drop(unsafe { CString::from_raw(s) });  // Rust가 할당한 것은 Rust가 해제
    }
}
```

```c
// C 쪽 사용
typedef struct { double x, y; } Point;
double rr_point_len(const Point* p);
char* rr_greet(const char* name);
void rr_free_string(char* s);

Point p = {3, 4};
printf("%f\n", rr_point_len(&p));       // 5.0
char* g = rr_greet("kim");
printf("%s\n", g);
rr_free_string(g);                       // free(g)가 아니라 반드시 Rust 쪽 해제 함수
```

FFI 경계의 규칙:

- 구조체는 `#[repr(C)]`. 기본 배치(`repr(Rust)`)는 필드 순서가 바뀔 수 있다.
- **할당한 쪽이 해제한다.** Rust 할당자와 C의 `malloc`/`free`는 다를 수 있다.
- `extern "C"` 함수에서 panic이 경계를 넘으려 하면 프로세스가 **abort**된다. 실패는 에러 코드로 돌려주자.
- `cbindgen`으로 Rust 코드에서 C 헤더를 자동 생성할 수 있다.

> [!cpp] **C++ 연동**
>
> C++ ABI는 표준이 없으므로 C ABI(`extern "C"`)를 경유하는 것이 기본이다. `std::string`, `std::vector`, `unique_ptr`을 안전하게 주고받으려면 **`cxx`** 크레이트를 쓴다. 양쪽 타입을 한 곳에 선언하면 안전한 브리지 코드를 생성하고, `autocxx`는 기존 C++ 헤더에서 바인딩을 만든다. 기존 C++ 프로젝트에 Rust를 조금씩 도입할 때 표준적인 경로다.

## 흔한 컴파일 에러

| 코드 / 메시지 | 원인 | 해결 |
|---|---|---|
| E0133: call to unsafe function requires unsafe block | `unsafe fn`이나 FFI 함수 호출, 원시 포인터 역참조 | 불변식을 확인하고 `unsafe { }` + `// SAFETY:` |
| extern blocks must be unsafe | 2024 에디션에서 `extern "C" { }` | `unsafe extern "C" { }` |
| unsafe attribute used without unsafe | 2024 에디션에서 `#[no_mangle]` | `#[unsafe(no_mangle)]` |
| creating a shared reference to mutable static | `static mut` 참조 생성 (`static_mut_refs`) | 아토믹, `Mutex`, `&raw mut` |
| warning: `extern` block uses type `String`, which is not FFI-safe | FFI에 Rust 전용 타입 사용 | `*const c_char`, `#[repr(C)]` 구조체 |

## 정리

- `unsafe`는 다섯 가지 능력만 열어 준다. 빌림 검사 등은 그대로다.
- 목표는 unsafe를 작게 가두고 **안전한 API**로 감싸는 것이다. `// SAFETY:` 주석으로 근거를 남긴다.
- Rust의 UB에는 별칭 규칙 위반과 잘못된 값 생성이 포함된다. Miri로 검사한다.
- C 호출은 `unsafe extern "C"`, C에 노출은 `#[unsafe(no_mangle)] extern "C" fn` + `#[repr(C)]`.
- 할당한 쪽이 해제하고, panic은 경계를 넘기지 않는다. C++ 연동은 `cxx`.

## 연습문제

1. 원시 포인터만 사용해 두 `i32`를 맞바꾸는 `unsafe fn swap_raw(a: *mut i32, b: *mut i32)`를 작성하고, `# Safety` 문서를 달자. 같은 포인터를 두 번 넘기면 어떻게 될까?
2. `unsafe extern "C"`로 C 표준 함수 `toupper(int) -> int`를 선언하고, 이를 이용해 ASCII 문자열을 대문자로 바꾸는 안전한 함수 `fn upper(s: &str) -> String`을 작성하자.
3. C에서 호출할 `rr_sum(const int32_t* data, size_t len) -> int64_t`를 구현하자. `data`가 null이면 0을 반환하자.

<details>
<summary>정답</summary>

```rust
use std::ffi::c_int;

/// # Safety
/// `a`와 `b`는 모두 유효하고 정렬된 `i32`를 가리켜야 한다.
unsafe fn swap_raw(a: *mut i32, b: *mut i32) {
    unsafe {
        let tmp = *a;
        *a = *b;
        *b = tmp;
    }
}
// 같은 포인터를 넘기면 tmp에 저장했다가 그대로 다시 쓰므로 값은 변하지 않는다.
// 원시 포인터끼리는 별칭이 허용되므로 UB도 아니다. 반면 &mut 두 개로 같은 곳을 가리키면 UB다.

unsafe extern "C" {
    fn toupper(c: c_int) -> c_int;          // 인자 범위에 따라 UB가 될 수 있으므로 unsafe로 둔다
}

fn upper(s: &str) -> String {
    s.chars()
        .map(|ch| {
            if ch.is_ascii() {
                // SAFETY: ASCII 값(0..=127)은 toupper의 유효한 입력 범위다.
                unsafe { toupper(ch as c_int) as u8 as char }
            } else {
                ch
            }
        })
        .collect()
}

#[unsafe(no_mangle)]
pub extern "C" fn rr_sum(data: *const i32, len: usize) -> i64 {
    if data.is_null() {
        return 0;
    }
    // SAFETY: 호출자는 data가 len개의 i32를 가리킨다고 보장한다.
    let xs = unsafe { std::slice::from_raw_parts(data, len) };
    xs.iter().map(|&x| x as i64).sum()
}

fn main() {
    let (mut x, mut y) = (1, 2);
    unsafe { swap_raw(&raw mut x, &raw mut y) };
    println!("{x} {y}");                         // 2 1
    println!("{}", upper("hello, 한글"));         // HELLO, 한글
    let v = [1, 2, 3];
    println!("{}", rr_sum(v.as_ptr(), v.len())); // 6
}
```

C의 `toupper`는 `EOF`나 `unsigned char` 범위 밖의 값을 받으면 UB다. 그래서 `safe fn`으로 선언하지 않고, 입력을 ASCII로 제한하는 안전한 래퍼(`upper`) 안에서만 호출했다. 이런 판단과 근거를 남기는 것이 FFI 래퍼를 쓰는 사람의 책임이다.

</details>
