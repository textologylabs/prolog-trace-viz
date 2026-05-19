# Prolog Execution Trace: gcd(10, 16, X)

## Query

```
gcd(10, 16, X)
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 6 | `gcd(X, X, X)` |
| 9 | `gcd(X, Y, D) :- X < Y, Y1 is Y - X, gcd(X, Y1, D)` |
| 15 | `gcd(X, Y, D) :- Y < X, gcd(Y, X, D)` |
| 22 | `llength([], 0)` |
| 23 | `llength([_|T], N) :- llength(T, N1), N is N1 + 1` |

## Execution Timeline

┌─ Step 1: gcd(10, 16, D)
│  Clause: gcd(X, Y, D) [line 9]
│  Unifications:
│    X = 10
│    Y = 16
│  Subgoals:
│    [1.1] X < Y → 10 < 16
│    [1.2] Y1 is Y - X → Y1 is 16 - 10
│    [1.3] gcd(X, Y1, D) → gcd(10, Y1, D)
│  
│  ┌─ Step 2 [Goal 1.1]: X < Y → 10 < 16
│  └─
│  ┌─ Step 3 [Goal 1.2]: Y1 is Y - X → Y1 is 16 - 10
│  │  => Y1 = 6
│  └─
│  ┌─ Step 4 [Goal 1.3]: gcd(X, Y1, D) → gcd(10, Y1, D)
│  │  Clause: gcd(X, Y, D) [line 15]
│  │  Unifications:
│  │    X = 10
│  │    Y = 6
│  │  Subgoals:
│  │    [4.1] Y < X → 6 < 10
│  │    [4.2] gcd(Y, X, D) → gcd(6, 10, D)
│  │  
│  │  ┌─ Step 5 [Goal 4.1]: Y < X → 6 < 10
│  │  └─
│  │  ┌─ Step 6 [Goal 4.2]: gcd(Y, X, D) → gcd(6, 10, D)
│  │  │  Clause: gcd(X, Y, D) [line 9]
│  │  │  Unifications:
│  │  │    X = 6
│  │  │    Y = 10
│  │  │  Subgoals:
│  │  │    [6.1] X < Y → 6 < 10
│  │  │    [6.2] Y1 is Y - X → Y1 is 10 - 6
│  │  │    [6.3] gcd(X, Y1, D) → gcd(6, Y1, D)
│  │  │  
│  │  │  ┌─ Step 7 [Goal 6.1]: X < Y → 6 < 10
│  │  │  └─
│  │  │  ┌─ Step 8 [Goal 6.2]: Y1 is Y - X → Y1 is 10 - 6
│  │  │  │  => Y1 = 4
│  │  │  └─
│  │  │  ┌─ Step 9 [Goal 6.3]: gcd(X, Y1, D) → gcd(6, Y1, D)
│  │  │  │  Clause: gcd(X, Y, D) [line 15]
│  │  │  │  Unifications:
│  │  │  │    X = 6
│  │  │  │    Y = 4
│  │  │  │  Subgoals:
│  │  │  │    [9.1] Y < X → 4 < 6
│  │  │  │    [9.2] gcd(Y, X, D) → gcd(4, 6, D)
│  │  │  │  
│  │  │  │  ┌─ Step 10 [Goal 9.1]: Y < X → 4 < 6
│  │  │  │  └─
│  │  │  │  ┌─ Step 11 [Goal 9.2]: gcd(Y, X, D) → gcd(4, 6, D)
│  │  │  │  │  Clause: gcd(X, Y, D) [line 9]
│  │  │  │  │  Unifications:
│  │  │  │  │    X = 4
│  │  │  │  │    Y = 6
│  │  │  │  │  Subgoals:
│  │  │  │  │    [11.1] X < Y → 4 < 6
│  │  │  │  │    [11.2] Y1 is Y - X → Y1 is 6 - 4
│  │  │  │  │    [11.3] gcd(X, Y1, D) → gcd(4, Y1, D)
│  │  │  │  │  
│  │  │  │  │  ┌─ Step 12 [Goal 11.1]: X < Y → 4 < 6
│  │  │  │  │  └─
│  │  │  │  │  ┌─ Step 13 [Goal 11.2]: Y1 is Y - X → Y1 is 6 - 4
│  │  │  │  │  │  => Y1 = 2
│  │  │  │  │  └─
│  │  │  │  │  ┌─ Step 14 [Goal 11.3]: gcd(X, Y1, D) → gcd(4, Y1, D)
│  │  │  │  │  │  Clause: gcd(X, Y, D) [line 15]
│  │  │  │  │  │  Unifications:
│  │  │  │  │  │    X = 4
│  │  │  │  │  │    Y = 2
│  │  │  │  │  │  Subgoals:
│  │  │  │  │  │    [14.1] Y < X → 2 < 4
│  │  │  │  │  │    [14.2] gcd(Y, X, D) → gcd(2, 4, D)
│  │  │  │  │  │  
│  │  │  │  │  │  ┌─ Step 15 [Goal 14.1]: Y < X → 2 < 4
│  │  │  │  │  │  └─
│  │  │  │  │  │  ┌─ Step 16 [Goal 14.2]: gcd(Y, X, D) → gcd(2, 4, D)
│  │  │  │  │  │  │  Clause: gcd(X, Y, D) [line 9]
│  │  │  │  │  │  │  Unifications:
│  │  │  │  │  │  │    X = 2
│  │  │  │  │  │  │    Y = 4
│  │  │  │  │  │  │  Subgoals:
│  │  │  │  │  │  │    [16.1] X < Y → 2 < 4
│  │  │  │  │  │  │    [16.2] Y1 is Y - X → Y1 is 4 - 2
│  │  │  │  │  │  │    [16.3] gcd(X, Y1, D) → gcd(2, Y1, D)
│  │  │  │  │  │  │  
│  │  │  │  │  │  │  ┌─ Step 17 [Goal 16.1]: X < Y → 2 < 4
│  │  │  │  │  │  │  └─
│  │  │  │  │  │  │  ┌─ Step 18 [Goal 16.2]: Y1 is Y - X → Y1 is 4 - 2
│  │  │  │  │  │  │  │  => Y1 = 2
│  │  │  │  │  │  │  └─
│  │  │  │  │  │  │  ┌─ Step 19 [Goal 16.3]: gcd(X, Y1, D) → gcd(2, Y1, D)
│  │  │  │  │  │  │  │  Fact: gcd(X, X, X) [line 6]
│  │  │  │  │  │  │  │  Unifications:
│  │  │  │  │  │  │  │    X = 2
│  │  │  │  │  │  │  │    X = 2
│  │  │  │  │  │  │  │  => D = 2
│  │  │  │  │  │  │  └─
│  │  │  │  │  │  │  => D = 2
│  │  │  │  │  │  └─
│  │  │  │  │  │  => D = 2
│  │  │  │  │  └─
│  │  │  │  │  => D = 2
│  │  │  │  └─
│  │  │  │  => D = 2
│  │  │  └─
│  │  │  => D = 2
│  │  └─
│  │  => D = 2
│  └─
│  => D = 2
│  Query Variable: X = 2
└─


## Call Tree

```mermaid
graph TD

%% Nodes
A["① gcd(X, Y, D)<br/>clause 9<br/>Result: D=2"]
B["② 10<16"]
C["③ 6 is 16-10"]
D["④ gcd(X, Y, D)<br/>clause 15<br/>Result: D=2"]
F["⑤ 6<10"]
G["⑥ gcd(X, Y, D)<br/>clause 9<br/>Result: D=2"]
H["⑦ 6<10"]
I["⑧ 4 is 10-6"]
J["⑨ gcd(X, Y, D)<br/>clause 15<br/>Result: D=2"]
L["⑩ 4<6"]
M["⑪ gcd(X, Y, D)<br/>clause 9<br/>Result: D=2"]
N["⑫ 4<6"]
O["⑬ 2 is 6-4"]
P["⑭ gcd(X, Y, D)<br/>clause 15<br/>Result: D=2"]
R["⑮ 2<4"]
S["⑯ gcd(X, Y, D)<br/>clause 9<br/>Result: D=2"]
T["⑰ 2<4"]
U["⑱ 2 is 4-2"]
V["⑲ gcd(X, X, X)<br/>clause 6<br/>Result: X=2"]

%% Edges
A -->|"X < Y"| B
A -->|"Y1 is Y - X"| C
A -->|"gcd(X, Y1, D)"| D
D -->|"Y < X"| F
D -->|"gcd(Y, X, D)"| G
G -->|"X < Y"| H
G -->|"Y1 is Y - X"| I
G -->|"gcd(X, Y1, D)"| J
J -->|"Y < X"| L
J -->|"gcd(Y, X, D)"| M
M -->|"X < Y"| N
M -->|"Y1 is Y - X"| O
M -->|"gcd(X, Y1, D)"| P
P -->|"Y < X"| R
P -->|"gcd(Y, X, D)"| S
S -->|"X < Y"| T
S -->|"Y1 is Y - X"| U
S -->|"gcd(X, Y1, D)"| V

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px
style B fill:#c8e6c9,stroke:#388e3c
style C fill:#c8e6c9,stroke:#388e3c
style D fill:#c8e6c9,stroke:#388e3c
style F fill:#c8e6c9,stroke:#388e3c
style G fill:#c8e6c9,stroke:#388e3c
style H fill:#c8e6c9,stroke:#388e3c
style I fill:#c8e6c9,stroke:#388e3c
style J fill:#c8e6c9,stroke:#388e3c
style L fill:#c8e6c9,stroke:#388e3c
style M fill:#c8e6c9,stroke:#388e3c
style N fill:#c8e6c9,stroke:#388e3c
style O fill:#c8e6c9,stroke:#388e3c
style P fill:#c8e6c9,stroke:#388e3c
style R fill:#c8e6c9,stroke:#388e3c
style S fill:#c8e6c9,stroke:#388e3c
style T fill:#c8e6c9,stroke:#388e3c
style U fill:#c8e6c9,stroke:#388e3c
style V fill:#c8e6c9,stroke:#388e3c
```

## Final Answer

```
X = 2
```

_Showing first solution only._