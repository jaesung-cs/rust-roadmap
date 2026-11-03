---
title: 동시성 (Send/Sync, 스레드, 채널, Mutex)
order: 12
minutes: 40
---

Rust의 슬로건 중 하나가 **두려움 없는 동시성(fearless concurrency)** 이다. 소유권과 빌림 규칙, 그리고 두 개의 마커 트레이트 `Send`/`Sync`가 합쳐져 **데이터 레이스를 컴파일 타임에 막는다**.
도구 자체(스레드, 뮤텍스, 아토믹, 채널)는 C++과 거의 같다. 다른 것은 잘못 쓰면 컴파일이 안 된다는 점이다.

## 스레드 생성

```rust
use std::thread;
use std::time::Duration;

fn main() {
    let handle = thread::spawn(|| {
        for i in 0..3 {
            println!("worker {i}");
            thread::sleep(Duration::from_millis(10));
        }
        42                                  // 스레드의 반환값
    });

    println!("main continues");
    let result = handle.join().unwrap();    // 스레드가 panic했으면 Err
    println!("worker returned {result}");
}
```

`thread::spawn`의 클로저는 `'static`이어야 한다(9장). 새 스레드가 현재 함수보다 오래 살 수 있기 때문이다. 그래서 지역 변수를 쓰려면 `move`로 소유권을 넘긴다.

```rust
let data = vec![1, 2, 3];
let h = thread::spawn(move || {             // move 없으면 error[E0373]
    data.iter().sum::<i32>()
});
println!("{}", h.join().unwrap());
```

### 스코프 스레드: 빌려 쓰기

`thread::scope` 안에서 만든 스레드는 스코프가 끝나기 전에 **반드시 join된다**. 그래서 지역 변수를 빌려 쓸 수 있다.

```rust
use std::thread;

fn parallel_sum(v: &[u64]) -> u64 {
    let mid = v.len() / 2;
    let (left, right) = v.split_at(mid);
    thread::scope(|s| {
        let h1 = s.spawn(|| left.iter().sum::<u64>());   // left를 빌림
        let h2 = s.spawn(|| right.iter().sum::<u64>());
        h1.join().unwrap() + h2.join().unwrap()
    })                                                   // 여기서 모든 스레드 join 보장
}

fn main() {
    let v: Vec<u64> = (1..=1_000_000).collect();
    println!("{}", parallel_sum(&v));
}
```

> [!cpp] **C++ 비교**
>
> `thread::spawn`은 `std::thread`, `thread::scope`는 `std::jthread` 여러 개를 블록 끝에서 join하는 것과 비슷하다.
> 차이점: C++에서는 스레드에 지역 변수 참조를 넘기고 join을 잊으면 댕글링이 되지만, Rust에서는 `spawn`이 `'static`을 요구하거나 `scope`가 join을 보장하므로 컴파일이 안 된다.

## Send와 Sync

| 트레이트 | 의미 | 아닌 예 |
|---|---|---|
| `Send` | 값을 다른 스레드로 **옮겨도** 안전 | `Rc<T>` (카운트가 비원자적) |
| `Sync` | `&T`를 여러 스레드가 **공유해도** 안전 | `Cell<T>`, `RefCell<T>` |

- 둘 다 **자동 트레이트(auto trait)** 다. 모든 필드가 `Send`면 구조체도 자동으로 `Send`다. 직접 구현할 일은 거의 없다(구현하려면 `unsafe impl`).
- `thread::spawn`은 클로저가 `Send`일 것을 요구한다. 그래서 `Rc`를 캡처하면 컴파일 에러가 난다.

```rust
use std::rc::Rc;
use std::thread;

let rc = Rc::new(5);
thread::spawn(move || {          // error[E0277]: `Rc<i32>` cannot be sent between threads safely
    println!("{rc}");
});
```

이 메커니즘 덕분에 "스레드 안전하지 않은 타입을 실수로 공유하는" 버그가 원천 차단된다. C++에서는 문서와 리뷰로만 막을 수 있는 부분이다.

## 공유 상태: Arc<Mutex<T>>

여러 스레드가 같은 데이터를 수정할 때의 정석은 `Arc`(원자적 참조 카운트) + `Mutex`다.

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..8 {
        let counter = Arc::clone(&counter);          // 스레드마다 핸들 복제
        handles.push(thread::spawn(move || {
            for _ in 0..1000 {
                let mut guard = counter.lock().unwrap(); // MutexGuard: 락 획득
                *guard += 1;
            }                                         // guard drop → 락 해제
        }));
    }

    for h in handles {
        h.join().unwrap();
    }
    println!("{}", *counter.lock().unwrap());         // 8000
}
```

> [!cpp] **C++ 비교**
>
> C++의 `std::mutex`는 보호할 데이터와 **별개**다. 어떤 뮤텍스가 어떤 데이터를 지키는지는 주석과 규율에 달려 있다.
> Rust의 `Mutex<T>`는 데이터를 **안에 품는다**. 락을 잡지 않고는 데이터에 접근할 방법이 아예 없고, 가드(`MutexGuard`)가 drop되면 자동으로 풀린다(`std::lock_guard`).

- `lock()`이 `Result`를 반환하는 이유는 **포이즈닝(poisoning)** 때문이다. 락을 잡은 스레드가 panic하면 데이터가 깨졌을 수 있으므로 이후 `lock()`이 `Err`를 준다. 보통은 `unwrap()`으로 전파한다.
- 읽기가 많으면 `RwLock<T>`(`read()`, `write()`)를 쓴다. `std::shared_mutex`에 해당한다.
- 더 빠르고 포이즈닝이 없는 구현이 필요하면 `parking_lot` 크레이트를 쓴다.

> [!warn] **주의**
>
> Rust가 막는 것은 **데이터 레이스**다. 데드락, 락 순서 문제, 논리적 경쟁 상태(race condition)는 여전히 생길 수 있다. 가드를 필요 이상 오래 쥐지 말고, 여러 락은 항상 같은 순서로 잡자.

## 아토믹

단순한 카운터나 플래그에는 아토믹이 더 싸다. 메모리 순서 모델은 **C++20과 같다**.

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

let hits = Arc::new(AtomicUsize::new(0));
let hs: Vec<_> = (0..4).map(|_| {
    let hits = Arc::clone(&hits);
    thread::spawn(move || {
        for _ in 0..1000 {
            hits.fetch_add(1, Ordering::Relaxed);   // memory_order_relaxed
        }
    })
}).collect();
for h in hs { h.join().unwrap(); }
println!("{}", hits.load(Ordering::SeqCst));        // 4000
```

`Ordering`은 `Relaxed`, `Acquire`, `Release`, `AcqRel`, `SeqCst`로 C++의 `memory_order_*`와 일대일 대응한다. 전역 아토믹은 `static COUNT: AtomicUsize = AtomicUsize::new(0);`처럼 `Arc` 없이도 쓸 수 있다.

## 채널: 메시지 전달

"메모리를 공유해서 통신하지 말고, 통신해서 메모리를 공유하라." 스레드 간에 값을 **이동**시키는 채널이 표준에 있다.

```rust
use std::sync::mpsc;          // multi-producer, single-consumer
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    for id in 0..3 {
        let tx = tx.clone();                 // 생산자 복제
        thread::spawn(move || {
            for j in 0..2 {
                tx.send(format!("worker {id}: msg {j}")).unwrap();
            }
        });                                  // tx drop
    }
    drop(tx);                                // 원본 송신자도 닫아야 수신 루프가 끝남

    for msg in rx {                          // 모든 송신자가 drop되면 루프 종료
        println!("{msg}");
    }
}
```

- `send`는 값의 소유권을 넘긴다. 보낸 뒤에는 보낸 쪽에서 쓸 수 없으므로 공유로 인한 버그가 없다.
- `mpsc::sync_channel(n)`은 용량이 n인 **유한 채널**이다. 가득 차면 `send`가 블록되어 배압(backpressure)이 생긴다.
- 여러 소비자가 필요하면 `crossbeam-channel` 크레이트(MPMC, `select!` 지원)를 쓴다.

## 데이터 병렬: rayon

배열을 나눠 병렬 처리하는 일은 `rayon` 크레이트가 사실상 표준이다. `iter()`를 `par_iter()`로 바꾸기만 하면 작업 훔치기(work-stealing) 스레드 풀에서 실행된다.

```toml
[dependencies]
rayon = "1"
```

```rust
use rayon::prelude::*;

fn main() {
    let v: Vec<u64> = (1..=10_000_000).collect();
    let sum_sq: u64 = v.par_iter().map(|x| x * x % 7).sum();
    let mut words = vec!["pear", "apple", "fig"];
    words.par_sort();
    println!("{sum_sq} {words:?}");
}
```

데이터 레이스가 생길 수 있는 코드(예: 클로저 안에서 외부 `Vec`에 `push`)는 `Send`/`Sync` 검사 때문에 컴파일되지 않는다. OpenMP의 `parallel for`를 안전하게 쓰는 느낌이다.

## 무엇을 쓸까

| 상황 | 도구 |
|---|---|
| 독립적인 작업 몇 개 | `thread::spawn` + `join` |
| 지역 데이터를 나눠 병렬 처리 | `thread::scope` 또는 `rayon` |
| 컬렉션 병렬 map/filter/sort | `rayon` |
| 생산자-소비자 파이프라인 | 채널 (`mpsc`, `crossbeam-channel`) |
| 공유 상태 수정 | `Arc<Mutex<T>>`, `Arc<RwLock<T>>` |
| 카운터, 플래그 | 아토믹 |
| 수천 개의 I/O 대기 작업 | async (13장) |

## 흔한 컴파일 에러

| 코드 / 메시지 | 원인 | 해결 |
|---|---|---|
| E0373: closure may outlive the current function | `spawn` 클로저가 지역 변수를 빌림 | `move` 또는 `thread::scope` |
| E0277: `Rc<T>` cannot be sent between threads safely | `Rc`를 스레드로 이동 | `Arc` |
| E0277: `RefCell<T>` cannot be shared between threads safely | `Arc<RefCell<T>>` 사용 | `Arc<Mutex<T>>` |
| E0382: use of moved value | 루프 안에서 같은 `Arc`를 여러 클로저로 이동 | 반복마다 `Arc::clone` |
| E0596: cannot borrow data in an `Arc` as mutable | `Arc` 안의 값을 직접 수정 | `Mutex`/아토믹으로 감싸기 |

```rust
let data = std::sync::Arc::new(std::sync::Mutex::new(vec![]));
for i in 0..3 {
    std::thread::spawn(move || {          // error[E0382]: use of moved value: `data`
        data.lock().unwrap().push(i);     // value moved into closure here, in previous iteration of loop
    });
}
```

## 정리

- `thread::spawn`은 `'static` + `Send` 클로저를 요구한다. 지역 데이터를 빌리려면 `thread::scope`.
- `Send`(이동 가능)와 `Sync`(공유 가능)가 데이터 레이스를 컴파일 타임에 막는다.
- 공유 수정은 `Arc<Mutex<T>>`. 뮤텍스가 데이터를 품고, 가드가 drop되면 풀린다.
- 아토믹의 메모리 순서는 C++20과 같다.
- 채널은 소유권을 이동시키는 메시지 전달이다. 데이터 병렬은 `rayon`.
- 데드락과 논리적 경쟁 상태는 여전히 프로그래머의 몫이다.

## 연습문제

1. `thread::scope`와 `chunks`를 사용해 `&[u64]`를 4등분해 병렬로 합을 구하는 함수를 작성하자.
2. 생산자 스레드 2개가 각각 1..=5를 채널로 보내고, 메인 스레드가 모두 받아 합계를 출력하게 하자.
3. 단어 목록을 여러 스레드가 나눠 처리하며 `Arc<Mutex<HashMap<String, usize>>>`에 빈도를 기록하게 하자. 같은 일을 `rayon`의 `par_iter().fold(...).reduce(...)`로도 해 보고 어느 쪽이 락 경합이 적은지 생각해 보자.

<details>
<summary>정답</summary>

```rust
use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

// 1
fn par_sum(v: &[u64]) -> u64 {
    let chunk = v.len().div_ceil(4).max(1);
    thread::scope(|s| {
        let handles: Vec<_> = v.chunks(chunk).map(|c| s.spawn(move || c.iter().sum::<u64>())).collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    })
}

fn main() {
    let v: Vec<u64> = (1..=100).collect();
    println!("{}", par_sum(&v)); // 5050

    // 2
    let (tx, rx) = mpsc::channel();
    for _ in 0..2 {
        let tx = tx.clone();
        thread::spawn(move || {
            for i in 1..=5 {
                tx.send(i).unwrap();
            }
        });
    }
    drop(tx);
    println!("{}", rx.iter().sum::<i32>()); // 30

    // 3 (Mutex 버전)
    let words: Vec<String> = "a b a c b a".split(' ').map(String::from).collect();
    let freq = Arc::new(Mutex::new(HashMap::new()));
    thread::scope(|s| {
        for part in words.chunks(2) {
            let freq = Arc::clone(&freq);
            s.spawn(move || {
                for w in part {
                    *freq.lock().unwrap().entry(w.clone()).or_insert(0) += 1;
                }
            });
        }
    });
    println!("{:?}", freq.lock().unwrap());
}
```

`rayon` 버전은 각 스레드가 **자기 지역 HashMap**에 세고(`fold`), 마지막에 합친다(`reduce`). 락이 전혀 없으므로 단어가 많을수록 훨씬 빠르다.

```rust
use rayon::prelude::*;
use std::collections::HashMap;

fn count(words: &[String]) -> HashMap<&str, usize> {
    words
        .par_iter()
        .fold(HashMap::new, |mut m, w| {
            *m.entry(w.as_str()).or_insert(0) += 1;
            m
        })
        .reduce(HashMap::new, |mut a, b| {
            for (k, v) in b {
                *a.entry(k).or_insert(0) += v;
            }
            a
        })
}
```

`thread::scope` 안에서는 `Arc` 없이 `&Mutex<...>`를 그냥 빌려도 된다. 스코프가 join을 보장하기 때문이다.

</details>
