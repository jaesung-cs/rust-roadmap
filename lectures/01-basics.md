---
title: 기본 문법
order: 1
minutes: 30
---

이 장에서는 변수, 기본 타입, 함수, 제어 흐름을 빠르게 훑는다. C++과 문법은 다르지만 개념은 대부분 같으므로, **차이점** 위주로 보면 된다.
가장 중요한 차이는 두 가지다. 변수는 **기본적으로 불변**이고, Rust는 **표현식(expression) 중심 언어**이다.

## 변수와 가변성

```rust
fn main() {
    let x = 5;          // 불변. 타입은 i32로 추론
    let mut y = 10;     // 가변
    y += x;

    let z: u64 = 42;    // 타입 명시
    println!("{x} {y} {z}");
}
```

- `let`은 C++의 `auto`처럼 타입을 추론한다. 추론은 **함수 내부 전체**를 보고 이루어지므로, 나중에 사용하는 방식으로 타입이 정해지기도 한다.
- 불변 변수에 다시 대입하면 컴파일 에러다.

> [!cpp] **C++ 비교**
>
> `let x = 5;`는 `const auto x = 5;`에, `let mut y = 10;`은 `auto y = 10;`에 해당한다.
> C++은 "불변으로 만들려면 노력해야" 하고, Rust는 "가변으로 만들려면 표시해야" 한다.

### 섀도잉(shadowing)

같은 이름으로 `let`을 다시 쓰면 **새 변수**가 이전 변수를 가린다. 타입이 달라져도 된다.

```rust
let input = "42";                       // &str
let input: i32 = input.parse().unwrap(); // i32. 같은 이름 재사용
let input = input * 2;
```

변환 단계마다 `input_str`, `input_num` 같은 이름을 만들 필요가 없어 Rust에서 매우 흔한 관용구다. `mut`와 달리 각 변수는 여전히 불변이다.

### 상수

```rust
const MAX_POINTS: u32 = 100_000;        // 컴파일 타임 상수. 타입 명시 필수
static GREETING: &str = "hello";        // 고정 주소를 가진 전역 변수 ('static 수명)
```

`const`는 C++의 `constexpr` 변수처럼 사용 위치에 인라인되고, `static`은 프로그램 전체에서 하나의 메모리 위치를 갖는다. `static mut`은 `unsafe` 없이는 접근할 수 없다. 전역 가변 상태는 데이터 레이스의 원인이기 때문이다.

## 기본 타입

| 분류 | Rust | C++ 대응 |
|---|---|---|
| 부호 있는 정수 | `i8` `i16` `i32` `i64` `i128` `isize` | `int8_t` … `int64_t`, `ptrdiff_t` |
| 부호 없는 정수 | `u8` `u16` `u32` `u64` `u128` `usize` | `uint8_t` … `uint64_t`, `size_t` |
| 부동소수점 | `f32` `f64` | `float` `double` |
| 불리언 | `bool` | `bool` |
| 문자 | `char` (4바이트 유니코드 스칼라 값) | `char32_t`에 가까움 |
| 유닛 | `()` | `void` (단, 값으로 쓸 수 있음) |

- 정수 리터럴의 기본 타입은 `i32`, 실수는 `f64`이다.
- 리터럴 표기: `1_000_000`, `0xff`, `0o77`, `0b1010`, `b'A'`(u8), `10u8`, `2.5f32`
- 인덱스와 길이는 항상 `usize`이다. `int`로 인덱싱하는 C++ 습관은 버려야 한다.
- `char`는 1바이트가 아니다. 바이트를 다룰 때는 `u8`을 쓴다.

### 암시적 변환이 없다

```rust
let a: i32 = 10;
let b: i64 = 20;
// let c = a + b;            // error[E0308]: mismatched types
let c = a as i64 + b;         // 명시적 캐스트
let d = i64::from(a) + b;     // 손실 없는 변환 (권장)
let e = u8::try_from(300_i32); // 실패할 수 있는 변환 → Err(...)
println!("{c} {d} {e:?}");
```

`as`는 C의 캐스트처럼 잘림(truncation)이 일어날 수 있으니, 손실 없는 변환은 `From`, 실패 가능한 변환은 `TryFrom`을 쓰는 습관을 들이자. 이 트레이트들은 8장에서 다룬다.

### 정수 오버플로

```rust
let x: u8 = 255;
// let y = x + 1;           // debug: panic! "attempt to add with overflow"
                            // release: 0으로 wrap (정의된 동작)
let a = x.wrapping_add(1);   // 0         항상 wrap
let b = x.checked_add(1);    // None      Option으로 반환
let c = x.saturating_add(1); // 255       포화
let (d, overflowed) = x.overflowing_add(1); // (0, true)
```

> [!cpp] **C++ 비교**
>
> C++에서 signed 정수 오버플로는 UB이고 컴파일러가 이를 가정해 최적화한다. Rust에서는 어떤 경우에도 UB가 아니며, 의도를 메서드 이름으로 드러낸다.

## 튜플과 배열

```rust
let t: (i32, f64, char) = (1, 2.0, 'a');
let (a, b, c) = t;             // 구조 분해 (C++17 structured binding)
println!("{} {}", t.0, t.2);   // 인덱스 접근

let arr: [i32; 5] = [1, 2, 3, 4, 5]; // 고정 크기 배열. std::array<int, 5>
let zeros = [0u8; 1024];             // 같은 값으로 초기화
println!("{} {}", arr.len(), zeros[10]);
// arr[10];                          // 상수 인덱스면 컴파일 에러, 런타임 인덱스면 panic
```

배열 인덱싱은 **항상 범위 검사**를 한다. 범위를 벗어나면 UB가 아니라 panic(프로그램 중단)이다. 반복자를 쓰면 컴파일러가 검사를 제거하는 경우가 많아 성능 걱정은 크지 않다(10장).

## 함수

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b          // 세미콜론 없음 → 이 표현식이 반환값
}

fn print_sum(a: i32, b: i32) {     // 반환형 생략 = ()
    println!("{}", add(a, b));
}

fn main() {
    print_sum(1, 2);
}
```

- 매개변수 타입은 **반드시** 명시한다. 함수 시그니처가 추론의 경계다.
- 함수를 선언 전에 호출할 수 있다. 전방 선언이 필요 없다.
- 마지막 표현식이 반환값이다. 조기 반환에는 `return x;`를 쓴다.
- 함수 오버로딩과 기본 인자는 없다.

## 표현식과 문장

Rust에서는 블록 `{ ... }`, `if`, `match`, `loop`가 모두 **값을 갖는 표현식**이다. 세미콜론은 표현식을 문장으로 바꾸고 값을 버린다(결과는 `()`).

```rust
let y = {
    let x = 3;
    x * 2           // 블록의 값 = 6
};

let parity = if y % 2 == 0 { "even" } else { "odd" }; // 삼항 연산자 대신
```

> [!warn] **주의**
>
> 함수 끝에 습관적으로 세미콜론을 붙이면 반환값이 `()`가 되어 타입 에러가 난다.
>
> ```rust
> fn square(x: i32) -> i32 {
>     x * x;   // error[E0308]: mismatched types. 세미콜론을 지우라는 힌트가 나옴
> }
> ```

## 제어 흐름

### if

조건에 괄호가 필요 없고, 조건은 **반드시 `bool`** 이어야 한다. `if ptr`이나 `if count` 같은 암시적 bool 변환은 없다.

```rust
let n = 7;
if n < 0 {
    println!("negative");
} else if n == 0 {
    println!("zero");
} else {
    println!("positive");
}
```

### loop, while, for

```rust
// loop: 무한 루프. break로 값을 반환할 수 있음
let mut count = 0;
let result = loop {
    count += 1;
    if count == 10 {
        break count * 2;
    }
};

// while
while count > 0 {
    count -= 1;
}

// for: 반복자 기반 (C++의 range-based for)
for i in 0..5 { print!("{i} "); }        // 0 1 2 3 4   (반열린 구간)
for i in 0..=5 { print!("{i} "); }       // 0 1 2 3 4 5 (닫힌 구간)
for i in (0..5).rev() { print!("{i} "); } // 4 3 2 1 0

let arr = [10, 20, 30];
for (i, v) in arr.iter().enumerate() {
    println!("{i}: {v}");
}

// 레이블로 바깥 루프 제어
'outer: for x in 0..10 {
    for y in 0..10 {
        if x * y > 20 { break 'outer; }
    }
}
```

C 스타일 `for (int i = 0; i < n; ++i)`는 없다. 범위(range)나 반복자를 사용한다.

## 출력 포맷팅

```rust
let name = "Rust";
let pi = 3.14159;
let v = vec![1, 2, 3];

println!("Hello, {name}!");       // 변수 직접 캡처
println!("{} {}", name, pi);      // 위치 인자
println!("{pi:.2}");              // 소수점 2자리 → 3.14
println!("[{:>8}]", name);        // 오른쪽 정렬, 폭 8
println!("{:08.3}", pi);          // 0 채우기 → 0003.142
println!("{:x} {:b}", 255, 5);    // 16진수, 2진수
println!("{v:?}");                // 디버그 출력 → [1, 2, 3]
println!("{v:#?}");               // 보기 좋은 디버그 출력
eprintln!("to stderr");           // 표준 에러
let s = format!("{name}-{}", 1);  // String 생성 (std::format)
```

`{}`는 `Display` 트레이트, `{:?}`는 `Debug` 트레이트를 사용한다. 직접 만든 타입은 `#[derive(Debug)]`를 붙이면 `{:?}`로 출력할 수 있다(4장).

## 흔한 컴파일 에러

```rust
let x = 5;
x = 6;              // error[E0384]: cannot assign twice to immutable variable `x`
```

```rust
let n: i32 = 5;
let i: usize = 2;
let s = n + i;      // error[E0308]: mismatched types (expected `i32`, found `usize`)
```

```rust
let v = if true { 1 } else { "one" }; // error[E0308]: `if` and `else` have incompatible types
```

```rust
let x: i32;
println!("{x}");    // error[E0381]: used binding `x` isn't initialized
```

마지막 예처럼, 초기화되지 않은 변수 읽기(C++에서는 UB)도 컴파일 타임에 막힌다.

## 정리

- `let`은 불변, `let mut`은 가변이다. 섀도잉으로 같은 이름을 재사용하는 것은 관용구다.
- 정수 타입 크기가 이름에 드러나고(`i32`, `usize`), 암시적 변환은 없다.
- 오버플로, 범위 밖 인덱스, 미초기화 읽기 모두 UB가 아니라 panic이거나 컴파일 에러다.
- 블록, `if`, `loop`는 값을 갖는 표현식이다. 함수의 마지막 표현식이 반환값이다.
- `for`는 범위와 반복자 위에서만 동작한다.

## 연습문제

1. 섭씨 온도 `f64`를 화씨로 바꾸는 `fn c_to_f(c: f64) -> f64`를 작성하고, `-40.0`, `0.0`, `100.0`을 소수점 1자리로 출력하자.
2. `loop`와 `break 값`을 사용해 1부터 시작해 누적합이 처음으로 1000을 넘는 순간의 `n`을 구하자.
3. `u8` 값 200과 100을 더할 때 `checked_add`, `wrapping_add`, `saturating_add`의 결과를 각각 출력하자.

<details>
<summary>정답</summary>

```rust
fn c_to_f(c: f64) -> f64 {
    c * 9.0 / 5.0 + 32.0
}

fn main() {
    // 1
    for c in [-40.0, 0.0, 100.0] {
        println!("{c:.1}C = {:.1}F", c_to_f(c));
    }

    // 2
    let mut n = 0;
    let mut sum = 0;
    let answer = loop {
        n += 1;
        sum += n;
        if sum > 1000 {
            break n;
        }
    };
    println!("n = {answer}"); // 45

    // 3
    let (a, b) = (200u8, 100u8);
    println!("{:?} {} {}", a.checked_add(b), a.wrapping_add(b), a.saturating_add(b));
    // None 44 255
}
```

`9 / 5`처럼 정수 리터럴을 쓰면 `f64`와 섞을 수 없어 컴파일 에러가 난다. 실수 리터럴 `9.0`을 써야 한다.

</details>
