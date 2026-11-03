---
title: async/await와 tokio
order: 13
minutes: 35
---

스레드는 비싸다. 스택 메모리와 컨텍스트 스위칭 비용 때문에 연결 1만 개를 스레드 1만 개로 처리하기는 어렵다.
**async**는 대기 중인 작업을 적은 수의 스레드 위에서 번갈아 실행하는 **협력적 멀티태스킹**이다. 네트워크 서버, 크롤러처럼 **I/O를 많이 기다리는** 프로그램에 쓴다. CPU 계산 위주라면 스레드나 `rayon`이 맞다.

## Future와 async fn

```rust
async fn fetch_number() -> u32 {
    42
}

async fn run() {
    let n = fetch_number().await;    // 완료될 때까지 "양보하며" 기다림
    println!("{n}");
}
```

- `async fn`은 호출해도 **아무것도 실행하지 않는다.** `Future`라는 값을 반환할 뿐이다.
- `Future`는 `.await`하거나 실행기(executor)에 넘겨야 실행된다. 반복자처럼 **게으르다**.
- 컴파일러는 `async fn`을 상태 기계(state machine)로 변환한다. 각 `.await` 지점이 상태 하나다. 힙 할당 없이 스택 없는(stackless) 코루틴이 된다.

```rust
trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
    // Poll::Ready(값) 또는 Poll::Pending
}
```

실행기는 `poll`을 호출하고, `Pending`이면 I/O가 준비됐다는 알림(`Waker`)이 올 때까지 다른 작업을 돌린다. 직접 `poll`을 구현할 일은 거의 없다.

> [!cpp] **C++ 비교**
>
> C++20 코루틴(`co_await`)과 같은 스택 없는 코루틴이다. C++처럼 **표준 라이브러리에 실행기가 없다**는 점도 같다. Rust에서는 `tokio`가 사실상 표준 런타임이다.
> `std::async`/`std::future`와는 다르다. 그쪽은 스레드 기반이다.

## tokio 시작하기

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```

```rust
use std::time::Duration;
use tokio::time::sleep;

async fn task(name: &str, ms: u64) -> String {
    sleep(Duration::from_millis(ms)).await;      // 스레드를 막지 않는 대기
    format!("{name} done after {ms}ms")
}

#[tokio::main]                                   // main을 런타임으로 감싸는 매크로
async fn main() {
    let start = std::time::Instant::now();

    // 순차 실행: 약 300ms
    let a = task("a", 100).await;
    let b = task("b", 200).await;
    println!("{a}, {b}, {:?}", start.elapsed());

    // 동시 실행: 약 200ms (가장 긴 것)
    let start = std::time::Instant::now();
    let (a, b) = tokio::join!(task("a", 100), task("b", 200));
    println!("{a}, {b}, {:?}", start.elapsed());
}
```

`.await`를 차례로 쓰면 **순차** 실행이다. 동시에 진행하려면 `join!`으로 묶거나 `spawn`으로 별도 태스크를 만든다.

## 태스크: tokio::spawn

```rust
use tokio::task::JoinHandle;

#[tokio::main]
async fn main() {
    let mut handles: Vec<JoinHandle<u64>> = Vec::new();
    for i in 0..10 {
        handles.push(tokio::spawn(async move {          // 태스크: 가벼운 "그린 스레드"
            tokio::time::sleep(std::time::Duration::from_millis(10 * i)).await;
            i * i
        }));
    }

    let mut total = 0;
    for h in handles {
        total += h.await.unwrap();                      // 태스크가 panic하면 Err
    }
    println!("{total}");                                // 285
}
```

- 태스크는 수십만 개를 만들어도 된다. 하나당 메모리가 수백 바이트 수준이다.
- `tokio::spawn`은 `thread::spawn`처럼 `'static + Send`를 요구한다. 기본 런타임은 **멀티 스레드**라서 태스크가 스레드 사이를 옮겨 다니기 때문이다.

## 여러 Future 조합하기

```rust
use std::time::Duration;
use tokio::time::{sleep, timeout};

async fn slow() -> &'static str {
    sleep(Duration::from_secs(5)).await;
    "slow"
}

#[tokio::main]
async fn main() {
    // timeout: 시간 안에 안 끝나면 Err
    match timeout(Duration::from_millis(100), slow()).await {
        Ok(v) => println!("{v}"),
        Err(_) => println!("timed out"),
    }

    // select!: 먼저 끝나는 쪽만 취하고 나머지는 취소(drop)
    tokio::select! {
        v = slow() => println!("{v}"),
        _ = sleep(Duration::from_millis(50)) => println!("tick first"),
    }

    // try_join!: 모두 Ok면 결과 튜플, 하나라도 Err면 즉시 Err
    let r = tokio::try_join!(async { Ok::<i32, String>(1) }, async { Ok::<i32, String>(2) });
    println!("{r:?}");
}
```

Future를 **drop하면 취소**된다. `select!`에서 진 쪽이나 `timeout`이 끝난 작업은 다음 `.await` 지점에서 멈추고 정리된다. 별도의 취소 토큰 없이 RAII로 취소가 동작한다.

## 예제: TCP 에코 서버

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    println!("listening on 8080");

    loop {
        let (mut socket, addr) = listener.accept().await?;
        tokio::spawn(async move {                  // 연결마다 태스크 하나
            let mut buf = [0u8; 1024];
            loop {
                let n = match socket.read(&mut buf).await {
                    Ok(0) => return,               // 연결 종료
                    Ok(n) => n,
                    Err(e) => {
                        eprintln!("{addr}: {e}");
                        return;
                    }
                };
                if socket.write_all(&buf[..n]).await.is_err() {
                    return;
                }
            }
        });
    }
}
```

스레드 몇 개로 수만 개의 동시 연결을 처리할 수 있다. 실제 HTTP 서버는 `axum`, HTTP 클라이언트는 `reqwest`를 쓴다(둘 다 tokio 기반).

## async에서 조심할 것

### 1. 블로킹 호출 금지

async 태스크 안에서 `std::thread::sleep`, 동기 파일 I/O, 오래 걸리는 계산을 하면 **실행기 스레드 전체가 멈춘다**. 그 스레드의 다른 태스크도 같이 멈춘다.

```rust
// 나쁨: 런타임 스레드를 막는다
// std::thread::sleep(Duration::from_secs(1));

// 좋음
tokio::time::sleep(Duration::from_secs(1)).await;

// CPU를 오래 쓰는 작업은 블로킹 전용 스레드 풀로
let hash = tokio::task::spawn_blocking(|| expensive_hash()).await.unwrap();
```

파일, 소켓, 타이머는 `tokio::fs`, `tokio::net`, `tokio::time` 등 async 버전을 쓴다.

### 2. .await을 넘어 std Mutex 가드를 쥐지 말자

```rust
use std::sync::{Arc, Mutex};

async fn bad(data: Arc<Mutex<Vec<i32>>>) {
    let mut guard = data.lock().unwrap();
    guard.push(1);
    some_io().await;           // 가드를 쥔 채 양보 → 다른 태스크가 락을 기다리며 스레드를 막음
}                              // tokio::spawn(bad(...))은 컴파일 에러: future is not `Send`
```

`std::sync::MutexGuard`는 `Send`가 아니어서, 이런 Future는 `tokio::spawn`에 넘길 수 없다. 컴파일러가 이 버그를 잡아 주는 셈이다. 해결 방법:

- 가드의 범위를 `.await` 전에 끝내라(블록으로 감싸기). 대부분 이것으로 충분하다.
- `.await`을 넘어 락을 쥐어야 한다면 `tokio::sync::Mutex`를 쓴다(`lock().await`).

### 3. 채널

태스크 간 통신은 `tokio::sync::mpsc`(다대일), `oneshot`(응답 하나), `broadcast`(일대다), `watch`(최신 값 공유)를 쓴다. `recv().await`로 기다린다.

## Pin은 무엇인가

async 상태 기계는 지역 변수와 그것을 가리키는 참조를 함께 품을 수 있다. 즉 **자기 참조 구조체**가 될 수 있다. 2장에서 봤듯이 이런 값은 이동하면 안 된다.
`Pin<P>`는 "이 포인터가 가리키는 값은 더 이상 이동하지 않는다"는 약속을 타입으로 표현한다. 일반 코드에서는 거의 신경 쓸 일이 없고, Future를 직접 저장하거나 구현할 때 `Box::pin(fut)`, `tokio::pin!(fut)` 정도만 알면 된다.

## 흔한 에러

| 메시지 | 원인 | 해결 |
|---|---|---|
| E0752: `main` function is not allowed to be `async` | 런타임 없이 `async fn main` | `#[tokio::main]` |
| E0728: `await` is only allowed inside `async` functions and blocks | 동기 함수에서 `.await` | 함수를 `async`로, 또는 `async` 블록 |
| future cannot be sent between threads safely | `.await`을 넘어 `Rc`, `MutexGuard` 등 `!Send` 값 보유 | 범위 줄이기, `Arc`, `tokio::sync::Mutex` |
| warning: unused implementer of `Future` that must be used | `.await`를 빠뜨림 → 실행 안 됨 | `.await` 추가 |
| 런타임 panic: Cannot start a runtime from within a runtime | async 안에서 `block_on` 호출 | 그냥 `.await` |

## 정리

- async는 I/O 대기가 많은 작업을 적은 스레드로 처리하는 협력적 멀티태스킹이다.
- `async fn`은 게으른 `Future`를 반환한다. `.await`하거나 `spawn`해야 실행된다.
- 표준에 실행기가 없고, `tokio`가 사실상 표준이다. `join!`, `select!`, `timeout`, `spawn`으로 조합한다.
- Future를 drop하면 취소된다.
- async 안에서 블로킹 금지. `.await`을 넘어 `!Send` 값(특히 std `MutexGuard`)을 쥐지 않는다.

## 연습문제

1. 1~5초를 기다린 뒤 자기 번호를 반환하는 태스크 5개를 동시에 실행하고, 전체 소요 시간이 약 5초인지 확인하자.
2. 1번에서 `timeout`을 3초로 걸어, 시간 안에 끝난 결과만 모아 출력하자.
3. 에코 서버를 수정해 받은 줄을 대문자로 바꿔 돌려주게 하고, `tokio::io::BufReader`의 `lines()`를 사용해 줄 단위로 처리하자.

<details>
<summary>정답</summary>

```rust
use std::time::{Duration, Instant};
use tokio::time::{sleep, timeout};

async fn job(i: u64) -> u64 {
    sleep(Duration::from_secs(i)).await;
    i
}

#[tokio::main]
async fn main() {
    // 1
    let start = Instant::now();
    let handles: Vec<_> = (1..=5).map(|i| tokio::spawn(job(i))).collect();
    for h in handles {
        print!("{} ", h.await.unwrap());
    }
    println!("in {:?}", start.elapsed()); // 약 5s

    // 2
    let handles: Vec<_> = (1..=5)
        .map(|i| tokio::spawn(timeout(Duration::from_secs(3), job(i))))
        .collect();
    let mut done = vec![];
    for h in handles {
        if let Ok(v) = h.await.unwrap() {
            done.push(v);
        }
    }
    println!("{done:?}"); // [1, 2] (3초 경계는 타이밍에 따라 포함될 수 있음)
}
```

```rust
// 3
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    loop {
        let (socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let (reader, mut writer) = socket.into_split();
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if writer.write_all(format!("{}\n", line.to_uppercase()).as_bytes()).await.is_err() {
                    break;
                }
            }
        });
    }
}
```

`telnet 127.0.0.1 8080` 또는 `nc 127.0.0.1 8080`으로 접속해 시험해 보자.

</details>
