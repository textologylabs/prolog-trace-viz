# Prolog Execution Trace: factorial(3, X)

## Query

```
factorial(3, X)
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 4 | `factorial(0, 1)` |
| 5 | `factorial(N, R) :- N > 0, N1 is N - 1, factorial(N1, R1), R is N * R1` |

## Execution Timeline

┌─ Step 1: factorial(3, R)
│  Clause: factorial(N, R) [line 5]
│  Unifications:
│    N = 3
│  Subgoals:
│    [1.1] N > 0 → 3 > 0
│    [1.2] N1 is N - 1 → N1 is 3 - 1
│    [1.3] factorial(N1, R1)
│    [1.4] R is N * R1 → R is 3 * R1
│  
│  ┌─ Step 2 [Goal 1.1]: N > 0 → 3 > 0
│  └─
│  ┌─ Step 3 [Goal 1.2]: N1 is N - 1 → N1 is 3 - 1
│  │  => N1 = 2
│  └─
│  ┌─ Step 4 [Goal 1.3]: factorial(2, R1)
│  │  Clause: factorial(N, R) [line 5]
│  │  Unifications:
│  │    N = 2
│  │  Subgoals:
│  │    [4.1] N > 0 → 2 > 0
│  │    [4.2] N1 is N - 1 → N1 is 2 - 1
│  │    [4.3] factorial(N1, R1)
│  │    [4.4] R is N * R1 → R is 2 * R1
│  │  
│  │  ┌─ Step 5 [Goal 4.1]: N > 0 → 2 > 0
│  │  └─
│  │  ┌─ Step 6 [Goal 4.2]: N1 is N - 1 → N1 is 2 - 1
│  │  │  => N1 = 1
│  │  └─
│  │  ┌─ Step 7 [Goal 4.3]: factorial(1, R1)
│  │  │  Clause: factorial(N, R) [line 5]
│  │  │  Unifications:
│  │  │    N = 1
│  │  │  Subgoals:
│  │  │    [7.1] N > 0 → 1 > 0
│  │  │    [7.2] N1 is N - 1 → N1 is 1 - 1
│  │  │    [7.3] factorial(N1, R1)
│  │  │    [7.4] R is N * R1 → R is 1 * R1
│  │  │  
│  │  │  ┌─ Step 8 [Goal 7.1]: N > 0 → 1 > 0
│  │  │  └─
│  │  │  ┌─ Step 9 [Goal 7.2]: N1 is N - 1 → N1 is 1 - 1
│  │  │  │  => N1 = 0
│  │  │  └─
│  │  │  ┌─ Step 10 [Goal 7.3]: factorial(0, R1)
│  │  │  │  Fact: factorial(0, 1) [line 4]
│  │  │  │  => R1 = 1
│  │  │  └─
│  │  │  ┌─ Step 11 [Goal 7.4]: R is N * R1 → R is 1 * 1
│  │  │  │  where R1 = 1 (from Step 10)
│  │  │  │  => R = 1
│  │  │  └─
│  │  │  => R1 = 1
│  │  └─
│  │  ┌─ Step 12 [Goal 4.4]: R is N * R1 → R is 2 * 1
│  │  │  where R1 = 1 (from Step 7)
│  │  │  => R = 2
│  │  └─
│  │  => R1 = 2
│  └─
│  ┌─ Step 13 [Goal 1.4]: R is N * R1 → R is 3 * 2
│  │  where R1 = 2 (from Step 4)
│  │  => R = 6
│  └─
│  => R = 6
│  Query Variable: X = 6
└─


## Call Tree

```mermaid
graph TD

%% Nodes
A["① factorial(N, R)<br/>clause 5<br/>Result: R=6"]
B["② 3>0"]
C["③ 2 is 3+ -1"]
D["④ factorial(N, R)<br/>clause 5<br/>Result: R=2"]
E["⑤ 2>0"]
F["⑥ 1 is 2+ -1"]
G["⑦ factorial(N, R)<br/>clause 5<br/>Result: R=1"]
H["⑧ 1>0"]
I["⑨ 0 is 1+ -1"]
J["⑩ factorial(0, 1)<br/>clause 4<br/>Result: _1280=1"]
K["⑪ 1 is 1*1"]
L["⑫ 2 is 2*1"]
M["⑬ 6 is 3*2"]

%% Edges
A -->|"N > 0"| B
A -->|"N1 is N - 1"| C
A -->|"factorial(N1, R1)"| D
D -->|"N > 0"| E
D -->|"N1 is N - 1"| F
D -->|"factorial(N1, R1)"| G
G -->|"N > 0"| H
G -->|"N1 is N - 1"| I
G -->|"factorial(N1, R1)"| J
G -->|"R is N * R1"| K
D -->|"R is N * R1"| L
A -->|"R is N * R1"| M

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px
style B fill:#c8e6c9,stroke:#388e3c
style C fill:#c8e6c9,stroke:#388e3c
style D fill:#c8e6c9,stroke:#388e3c
style E fill:#c8e6c9,stroke:#388e3c
style F fill:#c8e6c9,stroke:#388e3c
style G fill:#c8e6c9,stroke:#388e3c
style H fill:#c8e6c9,stroke:#388e3c
style I fill:#c8e6c9,stroke:#388e3c
style J fill:#c8e6c9,stroke:#388e3c
style K fill:#c8e6c9,stroke:#388e3c
style L fill:#c8e6c9,stroke:#388e3c
style M fill:#c8e6c9,stroke:#388e3c
```

## Final Answer

```
X = 6
```

_Showing first solution only._