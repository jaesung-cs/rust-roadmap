---
title: 스마트 포인터와 내부 가변성
order: 11
minutes: 40
---

지금까지는 "소유자 하나 + 빌림"으로 모든 것을 해결했다. 하지만 그래프, 캐시, 옵저버처럼 **여러 곳이 같은 데이터를 소유**하거나, 공유 참조만 가진 상태에서 **값을 바꿔야** 하는 경우가 있다.
Rust는 이런 경우를 스마트 포인터와 **내부 가변성(interior mutability)** 으로 처리한다. C++의 `unique_ptr`, `shared_ptr`, `weak_ptr`, `mutable`에 대응한다.

| Rust | C++ | 용도 |
|---|---|---|
| `Box<T>` | `unique_ptr<T>` | 힙 할당, 단일 소유 |
| `Rc<T>` | `shared_ptr<T>` (비원자적) | 단일 스레드 공유 소유 |
| `Arc<T>` | `shared_ptr<T>` | 멀티 스레드 공유 소유 (12장) |
| `Weak<T>` | `weak_ptr<T>` | 순환 참조 끊기 |
| `Cell<T>`, `RefCell<T>` | `mutable` 멤버 | 공유 참조로 값 변경 |
| `Mutex<T>`, `RwLock<T>` | `mutex` + 데이터 | 스레드 간 내부 가변성 (12장) |

## Box: 힙에 하나

```rust
let b = Box::new(5);          // 힙에 i32 하나
println!("{}", *b + 1);       // 역참조
// 스코프를 벗어나면 힙 메모리 해제 (unique_ptr과 동일)
```

`Box`가 필요한 대표적인 경우는 세 가지다.

1. **재귀 타입**: 크기를 컴파일 타임에 알아야 하므로 자기 자신을 직접 품을 수 없다.
2. **트레이트 객체**: `Box<dyn Trait>` (8장).
3. **큰 값을 이동할 때 복사 비용 줄이기**: 포인터만 이동한다.

```rust
#[derive(Debug)]
enum List {
    Cons(i32, Box<List>),     // Box 없이 List를 직접 품으면 error[E0072]: recursive type has infinite size
    Nil,
}

use List::{Cons, Nil};

fn sum(list: &List) -> i32 {
    match list {
        Cons(v, rest) => v + sum(rest),   // &Box<List>는 &List로 자동 역참조
        Nil => 0,
    }
}

fn main() {
    let list = Cons(1, Box::new(Cons(2, Box::new(Cons(3, Box::new(Nil))))));
    println!("{} {list:?}", sum(&list));
}
```

## Deref와 Drop

스마트 포인터는 두 트레이트로 만든다.

- `Deref`: `*p`와 자동 역참조를 제공한다. `Box<String>`에서 바로 `.len()`을 부를 수 있는 이유다.
- `Drop`: 스코프를 벗어날 때 정리한다(2장).

**역참조 강제 변환(deref coercion)**: `&Box<String>` → `&String` → `&str`처럼, 함수 인자에서 `Deref`를 여러 번 자동 적용한다. 그래서 `&str`을 받는 함수에 `&Box<String>`, `&Rc<String>`을 그대로 넘길 수 있다.

```rust
use std::ops::Deref;

struct MyBox<T>(T);

impl<T> Deref for MyBox<T> {
    type Target = T;
    fn deref(&self) -> &T { &self.0 }
}

fn hello(name: &str) { println!("hello {name}"); }

fn main() {
    let m = MyBox(String::from("rust"));
    hello(&m);                       // &MyBox<String> → &String → &str
}
```

> [!warn] **주의**
>
> `Deref`는 스마트 포인터용이다. 상속 흉내(구조체가 내부 필드로 `Deref`해서 메서드를 "물려받기")에 쓰는 것은 안티패턴이다. 위임은 명시적인 메서드로 하자.

## Rc: 공유 소유

```rust
use std::rc::Rc;

let a = Rc::new(String::from("shared"));
let b = Rc::clone(&a);              // 참조 카운트 +1 (데이터는 복사 안 함)
let c = a.clone();                  // 같은 동작. Rc::clone이 의도를 더 잘 드러냄
println!("{} {}", Rc::strong_count(&a), b);   // 3 shared
drop(c);
println!("{}", Rc::strong_count(&a));         // 2
```

- `Rc<T>`를 통해서는 **공유 참조(`&T`)만** 얻을 수 있다. 여러 소유자가 동시에 수정하면 빌림 규칙(공유 XOR 가변)이 깨지기 때문이다.
- 카운트 증감이 **원자적 연산이 아니다**. 그래서 `shared_ptr`보다 싸고, 대신 다른 스레드로 보낼 수 없다. 보내려고 하면 컴파일 에러가 난다(12장). 스레드 간에는 `Arc`를 쓴다.

## 내부 가변성: Cell과 RefCell

공유 참조만 있는데 값을 바꿔야 할 때가 있다. 캐시, 카운터, 공유 그래프 노드 등이다. Rust는 이를 **빌림 규칙 검사를 런타임으로 미루는** 타입으로 해결한다.

### Cell<T>: 복사해서 넣고 빼기

```rust
use std::cell::Cell;

struct Counter {
    hits: Cell<u32>,
}

impl Counter {
    fn hit(&self) {                    // &self인데도 수정 가능
        self.hits.set(self.hits.get() + 1);
    }
}

let c = Counter { hits: Cell::new(0) };
c.hit();
c.hit();
println!("{}", c.hits.get());          // 2
```

`Cell`은 내부 값의 **참조를 절대 내주지 않고** 값을 통째로 넣고 빼기만 한다(`get`은 `Copy` 타입만). 그래서 런타임 비용 없이 안전하다.

### RefCell<T>: 런타임 빌림 검사

```rust
use std::cell::RefCell;

let log = RefCell::new(Vec::<String>::new());

log.borrow_mut().push("start".into());   // 가변 빌림 (RefMut 가드)
{
    let r1 = log.borrow();               // 공유 빌림 (Ref 가드)
    let r2 = log.borrow();               // 공유 빌림 여러 개 OK
    println!("{} {}", r1.len(), r2.len());
}                                        // 가드가 drop되며 빌림 해제
log.borrow_mut().push("end".into());
println!("{:?}", log.borrow());
```

`RefCell`은 빌림 상태를 카운터로 들고 있다가, 규칙을 어기면 **panic**한다.

```rust
let cell = RefCell::new(1);
let r = cell.borrow();
let w = cell.borrow_mut();   // panic: already borrowed: BorrowMutError
```

컴파일 타임 보장을 런타임 검사로 바꾼 것이므로, 필요한 곳에만 좁게 쓴다. panic 대신 `Result`를 받으려면 `try_borrow_mut()`을 쓴다.

> [!cpp] **C++ 비교**
>
> `Cell`/`RefCell`은 C++의 `mutable` 멤버에 해당한다. 차이는 Rust 버전이 **안전**하다는 점이다. `RefCell`은 동시에 읽기와 쓰기가 일어나지 않음을 런타임에 확인하고, 단일 스레드 전용이라 데이터 레이스도 생길 수 없다(`!Sync`).

## Rc<RefCell<T>>: 공유 + 수정

여러 소유자가 같은 데이터를 수정해야 할 때의 정석 조합이다.

```rust
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug)]
struct Account {
    balance: i64,
}

fn main() {
    let shared = Rc::new(RefCell::new(Account { balance: 100 }));

    let alice = Rc::clone(&shared);
    let bob = Rc::clone(&shared);

    alice.borrow_mut().balance -= 30;
    bob.borrow_mut().balance += 50;

    println!("{:?}", shared.borrow());   // Account { balance: 120 }
}
```

## Weak: 순환 끊기

`Rc`끼리 서로 가리키면 카운트가 0이 되지 않아 **메모리 누수**가 생긴다(`shared_ptr`과 같은 문제). Rust의 안전성 보장에 누수 방지는 포함되지 않는다.
부모-자식처럼 방향이 있는 관계에서는 한쪽을 `Weak`로 둔다.

```rust
use std::cell::RefCell;
use std::rc::{Rc, Weak};

#[derive(Debug)]
struct Node {
    value: i32,
    parent: RefCell<Weak<Node>>,          // 부모는 약한 참조
    children: RefCell<Vec<Rc<Node>>>,     // 자식은 강한 참조 (소유)
}

fn main() {
    let leaf = Rc::new(Node {
        value: 3,
        parent: RefCell::new(Weak::new()),
        children: RefCell::new(vec![]),
    });

    let branch = Rc::new(Node {
        value: 5,
        parent: RefCell::new(Weak::new()),
        children: RefCell::new(vec![Rc::clone(&leaf)]),
    });

    *leaf.parent.borrow_mut() = Rc::downgrade(&branch);   // Rc → Weak

    // Weak는 upgrade()로 Option<Rc<T>>를 얻는다. 이미 해제됐으면 None
    if let Some(p) = leaf.parent.borrow().upgrade() {
        println!("leaf {} parent = {}", leaf.value, p.value);
    }
    println!("strong={} weak={}", Rc::strong_count(&branch), Rc::weak_count(&branch)); // 1 1
}
```

> [!tip] **팁**
>
> `Rc<RefCell<Node>>`로 그래프를 만들면 코드가 금방 복잡해진다. 실무에서는 노드를 `Vec<Node>`에 모아 두고 **인덱스로 서로 가리키는** 아레나(arena) 방식이 더 흔하고 빠르다. 삭제가 잦다면 `slotmap` 크레이트가 세대(generation) 기반 키를 제공한다.

## 지연 초기화: OnceCell, LazyLock

```rust
use std::sync::LazyLock;
use std::collections::HashMap;

static TABLE: LazyLock<HashMap<&str, u32>> = LazyLock::new(|| {
    println!("init once");
    HashMap::from([("a", 1), ("b", 2)])
});

fn main() {
    println!("{:?}", TABLE.get("a"));   // 처음 접근할 때 초기화
    println!("{:?}", TABLE.get("b"));
}
```

C++의 함수 지역 `static` 변수(스레드 안전한 지연 초기화)에 해당한다. 단일 스레드용은 `std::cell::OnceCell`, 스레드 안전한 버전은 `std::sync::OnceLock`/`LazyLock`이다.

## 흔한 컴파일 에러와 런타임 에러

| 코드 / 메시지 | 원인 | 해결 |
|---|---|---|
| E0072: recursive type has infinite size | 자기 자신을 직접 품는 타입 | `Box`, `Rc`, `Vec`으로 간접화 |
| E0596: cannot borrow data in an `Rc` as mutable | `Rc` 안의 값을 직접 수정 | `Rc<RefCell<T>>` 또는 `Rc<Cell<T>>` |
| E0277: `Rc<...>` cannot be sent between threads safely | `Rc`를 스레드로 이동 | `Arc` (12장) |
| E0277: `RefCell<...>` cannot be shared between threads safely | `RefCell`을 스레드 간 공유 | `Mutex`, `RwLock` |
| panic: already borrowed: BorrowMutError | `RefCell` 빌림 규칙 위반 | 가드 범위를 줄이기, `try_borrow_mut` |

```rust
use std::rc::Rc;

let v = Rc::new(vec![1, 2, 3]);
v.push(4);          // error[E0596]: cannot borrow data in an `Rc` as mutable
```

## 정리

- `Box`는 단일 소유 힙 할당이다. 재귀 타입과 트레이트 객체에 쓴다.
- `Rc`는 단일 스레드 공유 소유다. 통해서는 읽기만 가능하다.
- `Cell`/`RefCell`은 내부 가변성을 제공한다. `RefCell`은 빌림 규칙을 런타임에 검사하고 위반 시 panic한다.
- 공유 + 수정은 `Rc<RefCell<T>>`, 순환은 `Weak`로 끊는다. 스레드 간에는 `Arc<Mutex<T>>`(12장).
- 복잡한 그래프는 스마트 포인터보다 `Vec` + 인덱스가 단순하고 빠르다.

## 연습문제

1. `Box`를 사용해 정수 이진 탐색 트리 `enum Tree { Leaf, Node(Box<Tree>, i32, Box<Tree>) }`를 만들고 `insert`, `contains`를 구현하자.
2. 여러 `Rc<RefCell<Vec<String>>>` 핸들을 통해 같은 로그에 메시지를 추가하는 `Logger` 구조체를 만들고, 마지막에 로그 전체를 출력하자.
3. 다음 코드는 컴파일되지만 실행하면 panic한다. 이유를 설명하고 고치자.

   ```rust
   use std::cell::RefCell;

   fn main() {
       let data = RefCell::new(vec![1, 2, 3]);
       for x in data.borrow().iter() {
           if *x == 2 {
               data.borrow_mut().push(4);
           }
       }
   }
   ```

<details>
<summary>정답</summary>

```rust
use std::cell::RefCell;
use std::rc::Rc;

// 1
#[derive(Debug)]
enum Tree {
    Leaf,
    Node(Box<Tree>, i32, Box<Tree>),
}

impl Tree {
    fn insert(self, v: i32) -> Tree {
        match self {
            Tree::Leaf => Tree::Node(Box::new(Tree::Leaf), v, Box::new(Tree::Leaf)),
            Tree::Node(l, x, r) => {
                if v < x {
                    Tree::Node(Box::new(l.insert(v)), x, r)
                } else {
                    Tree::Node(l, x, Box::new(r.insert(v)))
                }
            }
        }
    }

    fn contains(&self, v: i32) -> bool {
        match self {
            Tree::Leaf => false,
            Tree::Node(l, x, r) => {
                if v == *x { true } else if v < *x { l.contains(v) } else { r.contains(v) }
            }
        }
    }
}

// 2
#[derive(Clone)]
struct Logger {
    sink: Rc<RefCell<Vec<String>>>,
    name: String,
}

impl Logger {
    fn log(&self, msg: &str) {
        self.sink.borrow_mut().push(format!("[{}] {msg}", self.name));
    }
}

fn main() {
    let t = [5, 2, 8, 1].into_iter().fold(Tree::Leaf, |t, v| t.insert(v));
    println!("{} {}", t.contains(8), t.contains(3)); // true false

    let sink = Rc::new(RefCell::new(Vec::new()));
    let a = Logger { sink: Rc::clone(&sink), name: "db".into() };
    let b = Logger { sink: Rc::clone(&sink), name: "net".into() };
    a.log("connected");
    b.log("listening");
    for line in sink.borrow().iter() {
        println!("{line}");
    }
}
```

3. `for` 루프가 도는 동안 `data.borrow()`의 공유 빌림 가드가 살아 있다. 그 안에서 `borrow_mut()`를 호출하면 `RefCell`이 규칙 위반을 감지해 panic한다. 3장의 반복자 무효화가 런타임에 잡힌 것이다. 읽기와 쓰기를 분리한다.

```rust
let need_push = data.borrow().iter().any(|&x| x == 2); // 가드는 이 문장 끝에서 해제
if need_push {
    data.borrow_mut().push(4);
}
```

</details>
