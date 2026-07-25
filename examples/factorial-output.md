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

┌─ Step 1: factorial(3, X)
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
│  => X = 6
└─


## Call Tree

```mermaid
graph TD

%% Nodes
A["?- factorial(3, X)"]
B["① factorial(3, X)<br/>clause 5<br/>X = 6"]
C["② N &gt; 0"]
D["③ N1 is N - 1"]
E["④ factorial(N1, R1)<br/>clause 5<br/>R1 = 2"]
F["⑤ N &gt; 0"]
G["⑥ N1 is N - 1"]
H["⑦ factorial(N1, R1)<br/>clause 5<br/>R1 = 1"]
I["⑧ N &gt; 0"]
J["⑨ N1 is N - 1"]
K["⑩ factorial(N1, R1)<br/>fact 4<br/>R1 = 1"]
L["⑪ R is N * R1"]
M["⑫ R is N * R1"]
N["⑬ R is N * R1"]

%% Edges
A --> B
B -->|"[1.1]"| C
B -->|"[1.2]"| D
B -->|"[1.3]"| E
E -->|"[4.1]"| F
E -->|"[4.2]"| G
E -->|"[4.3]"| H
H -->|"[7.1]"| I
H -->|"[7.2]"| J
H -->|"[7.3]"| K
H -->|"[7.4]"| L
E -->|"[4.4]"| M
B -->|"[1.4]"| N

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
style N fill:#c8e6c9,stroke:#388e3c
```

## Final Answer

```
X = 6
```

_Showing first solution only._