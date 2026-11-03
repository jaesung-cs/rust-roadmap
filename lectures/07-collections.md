---
title: 컬렉션과 문자열
order: 7
minutes: 35
---

이 장에서는 매일 쓰는 표준 컬렉션(`Vec`, `HashMap` 등)과 문자열(`String`, `&str`)을 다룬다.
대부분 C++ STL과 대응되지만, 두 가지가 크게 다르다. 원소 접근이 실패할 수 있으면 **`Option`을 반환**하고, 문자열은 항상 **유효한 UTF-8**이다.

## 표준 컬렉션 한눈에 보기

| Rust (`std::collections`) | C++ | 비고 |
|---|---|---|
| `Vec<T>` | `std::vector` | 가장 많이 씀. prelude에 포함 |
| `VecDeque<T>` | `std::deque` | 링 버퍼. 양쪽 끝 O(1) |
| `HashMap<K, V>` | `std::unordered_map` | 순회 순서 무작위 |
| `HashSet<T>` | `std::unordered_set` | |
| `BTreeMap<K, V>` | `std::map` | 키 정렬 순서로 순회 |
| `BTreeSet<T>` | `std::set` | |
| `BinaryHeap<T>` | `std::priority_queue` | 최대 힙 |
| `LinkedList<T>` | `std::list` | 거의 쓰지 않는다 |

## Vec

```rust
let mut v: Vec<i32> = Vec::new();
let mut w = vec![3, 1, 4, 1, 5];        // 매크로로 초기화
let zeros = vec![0; 10];                // 0을 10개
let mut buf = Vec::with_capacity(1024); // reserve와 같음
buf.push(1u8);

v.push(10);
v.extend([20, 30]);
let last = v.pop();                     // Option<i32>: Some(30)

let a = w[0];                           // 범위 밖이면 panic
let b = w.get(10);                      // Option<&i32>: None. 안전한 접근
let first = w.first();                  // Option<&i32>

w.sort();                               // 안정 정렬 (Ord 필요)
w.dedup();                              // 연속 중복 제거 → [1, 3, 4, 5]
w.retain(|&x| x != 3);                  // 조건을 만족하는 것만 남김 (erase-remove 관용구)
w.insert(0, 9);                         // O(n)
let removed = w.remove(1);              // O(n), 순서 유지
let swapped = w.swap_remove(0);         // O(1), 마지막 원소로 채움
println!("{v:?} {w:?} {a} {b:?} {first:?} {last:?} {removed} {swapped} {}", zeros.len());
```

슬라이스(`&[T]`) 메서드도 `Vec`에서 그대로 쓸 수 있다. 실제로 대부분의 메서드는 슬라이스에 정의되어 있다.

```rust
let v = vec![1, 3, 5, 7, 9];
v.contains(&5);                         // true
v.binary_search(&7);                    // Ok(3). 없으면 Err(삽입 위치)
v.iter().position(|&x| x > 4);          // Some(2)
for w in v.windows(2) { print!("{:?} ", w); } // [1,3] [3,5] [5,7] [7,9]
for c in v.chunks(2) { print!("{:?} ", c); }  // [1,3] [5,7] [9]
let (left, right) = v.split_at(2);
```

> [!warn] **주의**
>
> `f64`는 NaN 때문에 `Ord`가 아니라서 `v.sort()`가 컴파일되지 않는다. `v.sort_by(|a, b| a.total_cmp(b))`를 쓰자.
> 키로 정렬할 때는 `sort_by_key(|p| p.age)`를 쓴다.

## HashMap

```rust
use std::collections::HashMap;

let mut scores: HashMap<String, u32> = HashMap::new();
scores.insert("kim".to_string(), 90);
scores.insert("lee".to_string(), 80);

// 조회: Option<&V>를 반환. operator[]처럼 몰래 기본값을 삽입하지 않는다
if let Some(s) = scores.get("kim") {    // String 키를 &str로 조회 가능
    println!("kim: {s}");
}
let park = scores.get("park").copied().unwrap_or(0);

// 순회 (순서는 무작위)
for (name, score) in &scores {
    println!("{name}: {score}");
}

scores.remove("lee");
println!("{} {park}", scores.len());
```

> [!cpp] **C++ 비교**
>
> C++의 `map[key]`는 키가 없으면 기본값을 **삽입**하는 함정이 있다. Rust의 `map[&key]`는 키가 없으면 panic이고, 보통은 `get`으로 `Option`을 받는다.
> 삽입과 갱신은 아래의 **entry API**를 쓴다.

### entry API

"없으면 넣고, 있으면 수정"을 해시 계산 한 번으로 처리한다.

```rust
use std::collections::HashMap;

let text = "the quick brown fox jumps over the lazy dog the end";
let mut counts: HashMap<&str, usize> = HashMap::new();
for word in text.split_whitespace() {
    *counts.entry(word).or_insert(0) += 1;
}

let mut groups: HashMap<usize, Vec<&str>> = HashMap::new();
for word in text.split_whitespace() {
    groups.entry(word.len()).or_default().push(word); // 없으면 빈 Vec
}

counts.entry("fox").and_modify(|c| *c += 10).or_insert(1);
println!("{:?} {:?}", counts.get("the"), groups.get(&3));
```

- 키 타입은 `Eq + Hash`를 구현해야 한다. 직접 만든 타입은 `#[derive(PartialEq, Eq, Hash)]`.
- 기본 해시 함수(SipHash)는 HashDoS 공격에 강한 대신 느린 편이다. 성능이 중요하고 입력을 신뢰할 수 있다면 `rustc-hash`(`FxHashMap`)나 `ahash` 크레이트를 쓴다.
- 정렬된 순회가 필요하면 `BTreeMap`을 쓴다.

## 문자열: String과 &str

| 타입 | 소유 | 비유 |
|---|---|---|
| `String` | 소유. 힙 버퍼, 늘어날 수 있음 | `std::string` |
| `&str` | 빌림. (포인터, 길이) | `std::string_view` |
| `&'static str` | 프로그램 전체 동안 유효 | 문자열 리터럴 |

둘 다 내용이 **반드시 유효한 UTF-8**이다. 이 불변식을 깨는 연산(잘못된 바이트 경계에서 자르기 등)은 panic이 나거나 `Result`를 반환한다.

```rust
let mut s = String::from("hello");
s.push(' ');
s.push_str("world");
s += "!";

let a = "x".to_string();               // &str → String: 넷 다 같은 결과
let b = "x".to_owned();
let c = String::from("x");
let d: String = "x".into();

let view: &str = &s;                    // String → &str (deref coercion)
let part = &s[0..5];                    // "hello" (바이트 범위)
println!("{s} {view} {part} {a}{b}{c}{d}");
```

### 문자열 연결

```rust
let s1 = String::from("Hello, ");
let s2 = String::from("world");
let s3 = s1 + &s2;            // s1은 이동됨(버퍼 재사용), s2는 빌림
// println!("{s1}");          // error[E0382]
let s4 = format!("{s3} and {s2}!"); // 가장 읽기 쉬움. 아무것도 이동하지 않음
println!("{s4}");
```

### 인덱싱이 안 된다

```rust
let s = String::from("hello");
// let c = s[0];              // error[E0277]: the type `str` cannot be indexed by `{integer}`
```

UTF-8에서 한 문자는 1~4바이트라서 `s[i]`가 "i번째 문자"를 O(1)로 줄 수 없다. 그래서 Rust는 아예 막고, 무엇을 원하는지 명시하게 한다.

```rust
let s = "한글 abc";
println!("{}", s.len());                  // 10: 바이트 수 (한글은 3바이트씩)
println!("{}", s.chars().count());        // 6: 문자(유니코드 스칼라 값) 수
println!("{:?}", s.chars().nth(1));       // Some('글'): O(n)
println!("{:?}", s.as_bytes()[0]);        // 237: 첫 바이트
for (i, ch) in s.char_indices() {         // 바이트 위치와 문자
    print!("{i}:{ch} ");                  // 0:한 3:글 6:  7:a 8:b 9:c
}
// &s[0..1];                              // panic: byte index 1 is not a char boundary
```

> [!cpp] **C++ 비교**
>
> `std::string`은 인코딩을 모르는 바이트 컨테이너라서 `s[i]`, `s.size()`가 바이트 기준이고, 멀티바이트 문자를 반으로 자르는 버그가 생기기 쉽다.
> Rust의 `String`은 `Vec<u8>` + "항상 UTF-8"이라는 불변식이다. 바이트로 다루고 싶으면 `as_bytes()`로 명시하고, 임의 바이트에는 `Vec<u8>`을 쓴다.

### 자주 쓰는 문자열 메서드

```rust
let line = "  name = Kim, age = 30  ";
let t = line.trim();                               // 앞뒤 공백 제거
let parts: Vec<&str> = t.split(", ").collect();    // ["name = Kim", "age = 30"]
let (k, v) = parts[0].split_once(" = ").unwrap();  // ("name", "Kim")
let n: u32 = parts[1].rsplit(' ').next().unwrap().parse().unwrap(); // 30

t.starts_with("name");                             // true
t.contains("Kim");                                 // true
t.find('=');                                       // Some(5): 바이트 위치
t.replace("Kim", "Lee");                           // 새 String
t.to_uppercase();                                  // 새 String
"a\nb\nc".lines().count();                         // 3
"abc".chars().rev().collect::<String>();           // "cba"
println!("{k} {v} {n}");
```

`split`, `lines`, `chars` 등은 **반복자**를 반환한다. 원본을 빌려서 조각을 하나씩 내놓을 뿐 할당하지 않는다. 필요할 때만 `collect()`로 모은다(10장).

### 그 밖의 문자열 타입

| 타입 | 용도 |
|---|---|
| `OsString` / `&OsStr` | OS가 주는 문자열. Windows 파일 이름은 UTF-8이 아닐 수 있다 |
| `PathBuf` / `&Path` | 파일 경로. `join`, `extension`, `parent` 등 |
| `CString` / `&CStr` | NUL로 끝나는 C 문자열. FFI용(15장) |
| `Cow<'_, str>` | 빌린 것 또는 소유한 것. 대부분 수정이 필요 없을 때 할당을 피함 |

```rust
use std::path::Path;
let p = Path::new("data").join("input.txt");
println!("{:?} {:?}", p.extension(), p.file_stem()); // Some("txt") Some("input")
```

## 흔한 컴파일 에러

| 코드 | 메시지 | 해결 |
|---|---|---|
| E0277 | the type `str` cannot be indexed by `{integer}` | `chars().nth(i)`, `as_bytes()[i]`, 바이트 범위 슬라이스 |
| E0308 | expected `&str`, found `String` | `&s` 또는 `s.as_str()` |
| E0308 | expected `String`, found `&str` | `.to_string()`, `.into()` |
| E0277 | the trait bound `f64: Ord` is not satisfied | `sort_by(\|a, b\| a.total_cmp(b))` |
| E0277 | the trait bound `MyKey: Hash` is not satisfied | `#[derive(PartialEq, Eq, Hash)]` |
| E0502 | cannot borrow as mutable because it is also borrowed | `get`으로 빌린 참조를 쥔 채 `insert` → entry API |

## 정리

- `Vec`과 `HashMap`이 기본이다. 실패할 수 있는 접근(`get`, `pop`, `first`)은 `Option`을 반환한다.
- `HashMap` 삽입/갱신은 entry API를 쓴다. 정렬이 필요하면 `BTreeMap`.
- `String`은 소유하는 UTF-8 버퍼, `&str`은 빌린 뷰다. 인자로는 `&str`을 받는다.
- 문자열은 인덱싱할 수 없다. `len()`은 바이트 수이고, 문자는 `chars()`로 다룬다.
- 연결은 `format!`이 가장 읽기 쉽다. `+`는 왼쪽 피연산자를 이동한다.

## 연습문제

1. 문장을 받아 단어별 빈도를 세고, 빈도 내림차순(같으면 단어 오름차순)으로 상위 3개를 출력하자. 대소문자는 구분하지 않는다.
2. 문자열의 단어 순서를 뒤집는 `fn reverse_words(s: &str) -> String`을 작성하자. `"hello rust world"` → `"world rust hello"`.
3. `"안녕 Rust"`의 바이트 수, 문자 수, 그리고 처음 두 문자로 된 `&str`을 구하자. 바이트 범위를 하드코딩하지 말고 `char_indices`를 쓰자.

<details>
<summary>정답</summary>

```rust
use std::collections::HashMap;

fn top3(text: &str) {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for w in text.split_whitespace() {
        *counts.entry(w.to_lowercase()).or_insert(0) += 1;
    }
    let mut pairs: Vec<(String, usize)> = counts.into_iter().collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    for (w, c) in pairs.iter().take(3) {
        println!("{w}: {c}");
    }
}

fn reverse_words(s: &str) -> String {
    s.split_whitespace().rev().collect::<Vec<_>>().join(" ")
}

fn first_n_chars(s: &str, n: usize) -> &str {
    match s.char_indices().nth(n) {
        Some((byte_idx, _)) => &s[..byte_idx],
        None => s,                        // n자보다 짧으면 전체
    }
}

fn main() {
    top3("The cat and the dog and THE bird");   // the: 3, and: 2, bird: 1
    println!("{}", reverse_words("hello rust world"));
    let s = "안녕 Rust";
    println!("{} {} {}", s.len(), s.chars().count(), first_n_chars(s, 2)); // 11 7 안녕
}
```

`first_n_chars`는 입력을 빌린 `&str`을 반환한다. 반환값이 `s`보다 오래 살 수 없다는 것은 컴파일러가 보장한다(9장의 라이프타임 생략 규칙).

</details>
