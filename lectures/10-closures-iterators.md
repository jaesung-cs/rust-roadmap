---
title: 클로저와 반복자
order: 10
minutes: 40
---

클로저(closure)는 C++ 람다, 반복자(iterator)는 C++20 ranges에 해당한다. 둘을 조합하면 루프를 선언적으로 쓸 수 있고, 컴파일러가 손으로 짠 루프와 같은 기계어를 만든다(zero-cost abstraction).
관용적인 Rust 코드는 인덱스 루프보다 반복자 체인을 훨씬 많이 쓴다.

## 클로저 문법

```rust
let add_one = |x: i32| -> i32 { x + 1 };   // 완전한 형태
let add_one = |x| x + 1;                   // 타입 추론, 본문이 식 하나면 중괄호 생략
let greet = || println!("hi");             // 인자 없음

println!("{}", add_one(5));
greet();
```

클로저의 인자 타입은 **처음 사용할 때** 하나로 정해진다. C++의 generic lambda(`auto x`)처럼 여러 타입으로 호출할 수는 없다.

## 캡처

클로저는 주변 변수를 캡처한다. C++처럼 캡처 목록을 쓰지 않고, 컴파일러가 **본문에서 어떻게 쓰는지 보고** 가장 약한 방식을 고른다.

```rust
let name = String::from("kim");
let mut count = 0;
let data = vec![1, 2, 3];

let print = || println!("{name}");          // &name (공유 빌림)
let mut inc = || count += 1;                // &mut count (가변 빌림)
let consume = move || data.len();           // data를 소유권째 이동

print();
inc();
inc();
println!("{count} {}", consume());          // 2 3
// println!("{data:?}");                    // error[E0382]: data는 클로저로 이동됨
```

| 본문에서의 사용 | 캡처 방식 | C++ 대응 |
|---|---|---|
| 읽기만 | `&T` | `[&x]` |
| 수정 | `&mut T` | `[&x]` (mutable) |
| 소유권이 필요 (이동, drop) | `T` | `[x = std::move(x)]` |
| `move` 키워드 | 모든 캡처를 값으로 | `[=]` + move |

`move`는 클로저가 현재 스코프보다 **오래 살아야 할 때** 쓴다. 스레드로 넘기거나 클로저를 반환할 때다. 빌림 검사기는 클로저의 캡처에도 똑같이 적용되므로 댕글링 캡처(C++의 `[&]` 버그)는 컴파일되지 않는다.

## Fn, FnMut, FnOnce

모든 클로저는 고유한 익명 타입이고, 캡처 방식에 따라 다음 트레이트를 구현한다.

| 트레이트 | 호출 방식 | 의미 |
|---|---|---|
| `Fn` | `&self` | 여러 번, 동시에 호출 가능 (캡처를 읽기만) |
| `FnMut` | `&mut self` | 여러 번 호출 가능, 상태 변경 |
| `FnOnce` | `self` | 한 번만 호출 가능 (캡처를 소비) |

`Fn`이면 `FnMut`이기도 하고, `FnMut`이면 `FnOnce`이기도 하다. 클로저를 받는 함수는 **필요한 만큼만** 요구하는 게 좋다.

```rust
fn apply_twice<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(f(x))
}

fn repeat<F: FnMut()>(mut f: F, n: usize) {
    for _ in 0..n { f(); }
}

fn run_once<F: FnOnce() -> String>(f: F) -> String {
    f()
}

fn main() {
    println!("{}", apply_twice(|x| x * 3, 2));      // 18

    let mut total = 0;
    repeat(|| total += 5, 3);
    println!("{total}");                             // 15

    let s = String::from("owned");
    println!("{}", run_once(move || s));             // s를 반환하며 소비 → FnOnce만 가능
}
```

### 클로저 저장과 반환

```rust
// 반환: 타입 이름을 쓸 수 없으므로 impl Fn
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n                       // n을 복사해 가져가야 함수가 끝나도 유효
}

// 서로 다른 클로저를 한 컬렉션에: 트레이트 객체
let ops: Vec<Box<dyn Fn(i32) -> i32>> = vec![
    Box::new(|x| x + 1),
    Box::new(|x| x * 10),
    Box::new(make_adder(100)),
];
for op in &ops {
    print!("{} ", op(1));                // 2 10 101
}

// 캡처가 없는 클로저와 함수는 함수 포인터로도 쓸 수 있다
let f: fn(i32) -> i32 = |x| x - 1;
```

> [!cpp] **C++ 비교**
>
> `impl Fn`은 람다를 `auto`로 반환하는 것, `Box<dyn Fn>`은 `std::function`과 같다. 제네릭 `F: Fn`으로 받으면 템플릿처럼 인라인되므로 `std::function`의 간접 호출 비용이 없다.

## 반복자

반복자는 `Iterator` 트레이트를 구현한 타입이다. 필수 메서드는 하나뿐이다.

```rust
trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
    // map, filter, sum 등 70여 개의 기본 메서드
}
```

컬렉션에서 반복자를 얻는 세 가지 방법:

| 메서드 | Item | `for` 문법 | 원본 |
|---|---|---|---|
| `v.iter()` | `&T` | `for x in &v` | 유지 |
| `v.iter_mut()` | `&mut T` | `for x in &mut v` | 수정 가능 |
| `v.into_iter()` | `T` | `for x in v` | 소비됨 |

### 어댑터와 소비자

반복자는 **게으르다(lazy)**. `map`, `filter` 같은 어댑터는 새 반복자를 만들 뿐 아무것도 실행하지 않고, `collect`, `sum`, `for` 같은 **소비자**가 호출될 때 비로소 돈다.

```rust
let v = vec![1, 2, 3, 4, 5, 6];

let even_squares: Vec<i32> = v.iter()
    .filter(|&&x| x % 2 == 0)     // &&i32: iter()의 &i32를 filter가 다시 빌림
    .map(|&x| x * x)
    .collect();                   // [4, 16, 36]

let sum: i32 = v.iter().sum();                          // 21
let max = v.iter().max();                               // Some(&6)
let count = v.iter().filter(|x| **x > 2).count();       // 4
let any_big = v.iter().any(|&x| x > 5);                 // true
let pos = v.iter().position(|&x| x == 4);               // Some(3)
let product = v.iter().fold(1, |acc, x| acc * x);       // 720
println!("{even_squares:?} {sum} {max:?} {count} {any_big} {pos:?} {product}");
```

자주 쓰는 것들:

| 어댑터 (게으름) | 소비자 (실행) |
|---|---|
| `map`, `filter`, `filter_map` | `collect`, `for` 루프 |
| `enumerate`, `zip`, `chain` | `sum`, `product`, `count` |
| `take`, `skip`, `take_while`, `skip_while` | `min`, `max`, `min_by_key`, `max_by_key` |
| `rev`, `step_by`, `peekable` | `fold`, `reduce` |
| `flat_map`, `flatten` | `any`, `all`, `find`, `position` |
| `cloned`, `copied`, `inspect` | `last`, `nth`, `for_each` |

```rust
let names = ["kim", "lee", "park"];
let ages = [30, 25, 41];

for (i, (n, a)) in names.iter().zip(ages.iter()).enumerate() {
    println!("{i}: {n} ({a})");
}

let words = vec!["hello world", "rust is fun"];
let all: Vec<&str> = words.iter().flat_map(|s| s.split(' ')).collect();
let nums: Vec<i32> = ["1", "x", "3"].iter().filter_map(|s| s.parse().ok()).collect(); // [1, 3]
let evens: Vec<u32> = (0..).step_by(2).take(5).collect();  // [0, 2, 4, 6, 8]: 무한 범위도 OK
println!("{all:?} {nums:?} {evens:?}");
```

### collect의 다양한 목적지

`collect`는 `FromIterator`를 구현한 어떤 타입으로든 모을 수 있다. 목적지 타입을 적어 줘야 한다.

```rust
use std::collections::{HashMap, HashSet};

let words = ["apple", "bob", "cat", "bob"];
let v: Vec<_> = words.iter().collect();
let set: HashSet<_> = words.iter().collect();                         // 중복 제거
let lens: HashMap<&str, usize> = words.iter().map(|w| (*w, w.len())).collect();
let s: String = words.iter().map(|w| w.to_uppercase()).collect::<Vec<_>>().join("-");
let chars: String = "hello".chars().rev().collect();

// Result를 모으면: 모두 Ok면 Ok(Vec), 하나라도 Err면 첫 Err
let parsed: Result<Vec<i32>, _> = ["1", "2", "x"].iter().map(|s| s.parse::<i32>()).collect();
println!("{v:?} {} {lens:?} {s} {chars} {}", set.len(), parsed.is_err());
```

## 직접 반복자 만들기

`next`만 구현하면 모든 어댑터를 공짜로 얻는다.

```rust
struct Fib {
    a: u64,
    b: u64,
}

impl Iterator for Fib {
    type Item = u64;
    fn next(&mut self) -> Option<u64> {
        let r = self.a;
        self.a = self.b;
        self.b += r;
        Some(r)                              // 무한 반복자
    }
}

fn main() {
    let fib = Fib { a: 0, b: 1 };
    let v: Vec<u64> = fib.take_while(|&x| x < 100).filter(|x| x % 2 == 0).collect();
    println!("{v:?}");                       // [0, 2, 8, 34]
}
```

간단한 경우에는 `std::iter::from_fn`, `std::iter::successors`로 구조체 없이 만들 수도 있다.
함수에서 반복자를 반환할 때는 `impl Iterator<Item = T>`를 쓴다.

```rust
fn evens(limit: u32) -> impl Iterator<Item = u32> {
    (0..limit).filter(|x| x % 2 == 0)
}
```

## 성능: 정말 zero-cost인가

```rust
fn sum_sq(v: &[i32]) -> i32 {
    v.iter().map(|x| x * x).sum()
}
```

release 빌드에서 이 코드는 손으로 쓴 `for` 루프와 같은 기계어(대개 SIMD 벡터화까지)로 컴파일된다. 인덱스 루프 `for i in 0..v.len() { v[i] }`는 범위 검사가 남을 수 있어서, 오히려 반복자가 **더 빠른** 경우가 많다.

> [!cpp] **C++ 비교**
>
> C++20 ranges의 `v | views::filter(f) | views::transform(g)`와 같은 개념이다. Rust는 메서드 체인 형태이고, `collect`로 어떤 컨테이너든 바로 만들 수 있다.
> 반복자 무효화도 없다. 반복자가 컬렉션을 빌리고 있는 동안은 컬렉션을 수정할 수 없다(3장).

> [!tip] **팁**
>
> 표준 라이브러리에 없는 조합(`group_by`, `sorted`, `join`, `cartesian_product` 등)은 `itertools` 크레이트에 있다. `itertools = "0.14"`

## 흔한 컴파일 에러

| 코드 / 메시지 | 원인 | 해결 |
|---|---|---|
| E0373: closure may outlive the current function | 빌린 캡처를 가진 클로저를 반환/스레드로 넘김 | `move` 클로저 |
| E0525: expected a closure that implements `Fn`, but this closure only implements `FnOnce` | 캡처를 소비하는 클로저를 여러 번 호출하려 함 | `clone()` 후 이동, 또는 바운드를 `FnOnce`로 |
| E0282: type annotations needed | `collect` 목적지 타입을 모름 | `let v: Vec<_>` 또는 `collect::<Vec<_>>()` |
| E0599: `Vec<i32>` is not an iterator | `v.map(...)` 처럼 바로 호출 | `v.iter().map(...)` |
| warning: unused `Map` that must be used | 게으른 어댑터만 만들고 소비하지 않음 | `for` 또는 `for_each`, `collect` |

```rust
fn make_counter() -> impl FnMut() -> u32 {
    let mut count = 0;
    || { count += 1; count }   // error[E0373]: closure may outlive the current function, but it borrows `count`
}                              // 해결: move || { count += 1; count }
```

## 정리

- 클로저는 사용 방식에 따라 자동으로 빌리거나 이동해 캡처한다. 오래 살아야 하면 `move`.
- `Fn` ⊂ `FnMut` ⊂ `FnOnce`. 받는 쪽은 가장 약한 요구를 쓴다.
- 클로저 반환은 `impl Fn`, 이종 저장은 `Box<dyn Fn>`.
- 반복자는 게으르다. 어댑터를 연결하고 소비자로 실행한다.
- `iter()`/`iter_mut()`/`into_iter()`는 각각 빌림/가변 빌림/소비다.
- `collect`는 `Vec`, `HashMap`, `String`, `Result<Vec<_>, E>` 등 어디로든 모은다.

## 연습문제

1. `1..=100`에서 3이나 5의 배수의 합을 반복자 체인 한 줄로 구하자.
2. 문장에서 길이가 4 이상인 단어를 소문자로 바꾸고 중복을 제거해 정렬한 `Vec<String>`을 만들자.
3. `fn compose<A, B, C>(f: impl Fn(A) -> B, g: impl Fn(B) -> C) -> impl Fn(A) -> C`를 구현하자.
4. 1부터 시작해 콜라츠 수열(짝수면 /2, 홀수면 3n+1)을 내놓다가 1에서 끝나는 반복자를 `std::iter::successors`로 만들고, 27의 수열 길이를 구하자.

<details>
<summary>정답</summary>

```rust
fn compose<A, B, C>(f: impl Fn(A) -> B, g: impl Fn(B) -> C) -> impl Fn(A) -> C {
    move |x| g(f(x))
}

fn collatz(start: u64) -> impl Iterator<Item = u64> {
    std::iter::successors(Some(start), |&n| {
        if n == 1 { None } else if n % 2 == 0 { Some(n / 2) } else { Some(3 * n + 1) }
    })
}

fn main() {
    // 1
    let s: u32 = (1..=100).filter(|n| n % 3 == 0 || n % 5 == 0).sum();
    println!("{s}"); // 2418

    // 2
    let text = "The Rust language makes systems programming safe and the rust compiler helps";
    let mut words: Vec<String> = text
        .split_whitespace()
        .filter(|w| w.len() >= 4)
        .map(|w| w.to_lowercase())
        .collect();
    words.sort();
    words.dedup();
    println!("{words:?}");

    // 3
    let f = compose(|x: i32| x + 1, |y: i32| y * 2);
    println!("{}", f(3)); // 8

    // 4
    println!("{}", collatz(27).count()); // 112 (27과 1 포함)
}
```

</details>
