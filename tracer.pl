% Custom Prolog Tracer using prolog_trace_interception/4
% This tracer captures execution events and exports them as JSON

:- dynamic trace_event/1.
:- dynamic trace_active/0.
:- dynamic max_trace_depth/1.

%% install_tracer/0
%  Install the trace interception hook with default depth
install_tracer :-
    install_tracer(100).

%% install_tracer/1
%  Install the trace interception hook with specified max depth
install_tracer(MaxDepth) :-
    asserta(max_trace_depth(MaxDepth)),
    asserta(trace_active),
    trace.

%% remove_tracer/0
%  Remove the trace interception hook and clean up
remove_tracer :-
    notrace,
    retractall(trace_active),
    retractall(max_trace_depth(_)),
    clear_trace.

%% clear_trace/0
%  Clear all recorded trace events
clear_trace :-
    retractall(trace_event(_)).

%% user:prolog_trace_interception(+Port, +Frame, +Choice, -Action)
%  Hook predicate that intercepts trace events
user:prolog_trace_interception(Port, Frame, _Choice, continue) :-
    trace_active,
    % Check depth limit
    prolog_frame_attribute(Frame, level, Level),
    max_trace_depth(MaxDepth),
    Level =< MaxDepth,
    % Don't trace our own operations
    prolog_frame_attribute(Frame, goal, Goal),
    \+ is_tracer_goal(Goal),
    !,
    catch(
        capture_trace_event(Port, Frame),
        Error,
        handle_trace_error(Error, Port, Frame)
    ).
user:prolog_trace_interception(Port, Frame, _Choice, continue) :-
    trace_active,
    % Exceeded depth limit - record truncation marker once
    prolog_frame_attribute(Frame, level, Level),
    max_trace_depth(MaxDepth),
    Level > MaxDepth,
    \+ trace_event(truncated(MaxDepth)),
    !,
    assertz(trace_event(truncated(MaxDepth))).
user:prolog_trace_interception(_, _, _, continue).

%% is_tracer_goal(+Goal)
%  Check if a goal is part of the tracer infrastructure
is_tracer_goal(Goal) :-
    functor(Goal, Functor, _),
    tracer_predicate(Functor).

tracer_predicate(trace_event).
tracer_predicate(call_goal).
tracer_predicate(record_solution).
tracer_predicate(findnsols).
tracer_predicate(assertz).
tracer_predicate(retract).
tracer_predicate(retractall).
tracer_predicate(findall).
tracer_predicate(format).
tracer_predicate(write).
tracer_predicate(open).
tracer_predicate(close).

%% record_solution(+Bindings)
%  Inject a solution-boundary marker into the trace stream. Called once per
%  solution during findnsols/4 enumeration; Bindings is a list of Name=Value
%  for the query's variables, captured at the moment the solution is found.
record_solution(Bindings) :-
    assertz(trace_event(solution(Bindings))).

%% handle_trace_error(+Error, +Port, +Frame)
%  Handle errors during trace event capture
handle_trace_error(Error, Port, Frame) :-
    catch(
        (
            prolog_frame_attribute(Frame, goal, Goal),
            prolog_frame_attribute(Frame, level, Level),
            assertz(trace_event(event(Port, Level, Goal, error(Error), no_clause, unknown)))
        ),
        _,
        assertz(trace_event(event(Port, 0, error_goal, error(Error), no_clause, unknown)))
    ).

%% capture_trace_event(+Port, +Frame)
%  Capture a trace event with all relevant information
capture_trace_event(Port, Frame) :-
    prolog_frame_attribute(Frame, goal, Goal),
    prolog_frame_attribute(Frame, level, Level),
    functor(Goal, Name, Arity),
    format(atom(Predicate), '~w/~w', [Name, Arity]),
    
    % Extract arguments for exit port
    (   Port = exit
    ->  extract_frame_arguments(Frame, Arity, Arguments)
    ;   Arguments = []
    ),
    
    % Extract clause information with enhanced data
    extract_clause_info_enhanced(Frame, Goal, Port, ClauseInfo),
    
    % Extract parent information
    extract_parent_info(Frame, ParentInfo),
    
    % Record the event with enhanced information
    assertz(trace_event(event(Port, Level, Goal, Arguments, ClauseInfo, Predicate, ParentInfo))).

%% extract_frame_arguments(+Frame, +Arity, -Arguments)
%  Extract actual argument values from a frame
extract_frame_arguments(_, 0, []) :- !.
extract_frame_arguments(Frame, Arity, Arguments) :-
    Arity > 0,
    prolog_frame_attribute(Frame, goal, Goal),
    Goal =.. [_|Args],
    Arguments = Args.

%% extract_clause_info(+Frame, +Goal, -ClauseInfo)
%  Extract clause information (head, body, line number) from a frame
extract_clause_info(Frame, Goal, clause(Head, Body, Line)) :-
    catch(
        (
            prolog_frame_attribute(Frame, clause, ClauseRef),
            ClauseRef \= 0,
            clause(Head, Body, ClauseRef),
            clause_property(ClauseRef, line_count(Line))
        ),
        _,
        fail
    ),
    % Verify this clause matches the goal
    subsumes_term(Head, Goal),
    !.
extract_clause_info(_, _, no_clause).

%% extract_clause_info_enhanced(+Frame, +Goal, +Port, -ClauseInfo)
%  Extract clause information - keep it simple, TypeScript will handle variable names
extract_clause_info_enhanced(Frame, Goal, _, ClauseInfo) :-
    extract_clause_info(Frame, Goal, ClauseInfo).

%% extract_parent_info(+Frame, -ParentInfo)
%  Extract information about the parent frame
extract_parent_info(Frame, parent(ParentLevel, ParentGoal)) :-
    catch(
        (
            prolog_frame_attribute(Frame, parent, ParentFrame),
            ParentFrame \= 0,
            prolog_frame_attribute(ParentFrame, level, ParentLevel),
            prolog_frame_attribute(ParentFrame, goal, ParentGoal)
        ),
        _,
        fail
    ),
    !.
extract_parent_info(_, no_parent).

%% export_trace_json(+File)
%  Export all trace events as JSON
export_trace_json(File) :-
    findall(Event, trace_event(Event), Events),
    open(File, write, Stream),
    write_json_events(Stream, Events),
    close(Stream).

%% write_json_events(+Stream, +Events)
%  Write events as JSON array
write_json_events(Stream, Events) :-
    write(Stream, '[\n'),
    write_events_list(Stream, Events),
    write(Stream, '\n]').

%% write_events_list(+Stream, +Events)
%  Write list of events with comma separation
write_events_list(_, []).
write_events_list(Stream, [Event]) :-
    !,
    write(Stream, '  '),
    write_json_event_or_marker(Stream, Event).
write_events_list(Stream, [Event|Rest]) :-
    write(Stream, '  '),
    write_json_event_or_marker(Stream, Event),
    write(Stream, ',\n'),
    write_events_list(Stream, Rest).

%% write_json_event_or_marker(+Stream, +EventOrMarker)
%  Write either a regular event or a truncation marker
write_json_event_or_marker(Stream, truncated(MaxDepth)) :-
    !,
    format(Stream, '{"truncated": true, "max_depth": ~w}', [MaxDepth]).
write_json_event_or_marker(Stream, solution(Bindings)) :-
    !,
    format(Stream, '{"solution": true, "bindings": ', []),
    write_json_term(Stream, Bindings),
    format(Stream, '}', []).
write_json_event_or_marker(Stream, Event) :-
    write_json_event(Stream, Event).

%% write_json_event(+Stream, +Event)
%  Write a single event as JSON object
write_json_event(Stream, event(Port, Level, Goal, Arguments, ClauseInfo, Predicate, ParentInfo)) :-
    format(Stream, '{', []),
    format(Stream, '"port": "~w"', [Port]),
    format(Stream, ', "level": ~w', [Level]),
    format(Stream, ', "goal": ', []),
    write_json_term(Stream, Goal),
    format(Stream, ', "predicate": "~w"', [Predicate]),
    
    % Write arguments if present (exit port)
    (   Arguments \= []
    ->  format(Stream, ', "arguments": ', []),
        write_json_list(Stream, Arguments)
    ;   true
    ),
    
    % Write clause info if present
    write_clause_info_json(Stream, ClauseInfo),
    
    % Write parent info if present
    write_parent_info_json(Stream, ParentInfo),
    
    format(Stream, '}', []).
% Backward compatibility: handle old event format without ParentInfo
write_json_event(Stream, event(Port, Level, Goal, Arguments, ClauseInfo, Predicate)) :-
    format(Stream, '{', []),
    format(Stream, '"port": "~w"', [Port]),
    format(Stream, ', "level": ~w', [Level]),
    format(Stream, ', "goal": ', []),
    write_json_term(Stream, Goal),
    format(Stream, ', "predicate": "~w"', [Predicate]),
    
    % Write arguments if present (exit port)
    (   Arguments \= []
    ->  format(Stream, ', "arguments": ', []),
        write_json_list(Stream, Arguments)
    ;   true
    ),
    
    % Write clause info if present
    write_clause_info_json(Stream, ClauseInfo),
    
    format(Stream, '}', []).

%% write_clause_info_json(+Stream, +ClauseInfo)
%  Write clause information as JSON
write_clause_info_json(Stream, clause(Head, Body, Line)) :-
    !,
    format(Stream, ', "clause": {', []),
    format(Stream, '"head": ', []),
    write_json_term(Stream, Head),
    format(Stream, ', "body": ', []),
    write_json_term(Stream, Body),
    format(Stream, ', "line": ~w', [Line]),
    format(Stream, '}', []).
write_clause_info_json(_, no_clause).

%% write_parent_info_json(+Stream, +ParentInfo)
%  Write parent information as JSON
write_parent_info_json(Stream, parent(ParentLevel, ParentGoal)) :-
    !,
    format(Stream, ', "parent_info": {', []),
    format(Stream, '"level": ~w', [ParentLevel]),
    format(Stream, ', "goal": ', []),
    write_json_term(Stream, ParentGoal),
    format(Stream, '}', []).
write_parent_info_json(_, no_parent).

%% write_json_term(+Stream, +Term)
%  Write a Prolog term as JSON string
write_json_term(Stream, Term) :-
    format(atom(TermAtom), '~w', [Term]),
    write_json_string(Stream, TermAtom).

%% write_json_string(+Stream, +Atom)
%  Write an atom as JSON string with proper escaping
write_json_string(Stream, Atom) :-
    atom_chars(Atom, Chars),
    write(Stream, '"'),
    write_escaped_chars(Stream, Chars),
    write(Stream, '"').

%% write_escaped_chars(+Stream, +Chars)
%  Write characters with JSON escaping
write_escaped_chars(_, []).
write_escaped_chars(Stream, [Char|Rest]) :-
    (   Char = '"'
    ->  write(Stream, '\\"')
    ;   Char = '\\'
    ->  write(Stream, '\\\\')
    ;   Char = '\n'
    ->  write(Stream, '\\n')
    ;   Char = '\t'
    ->  write(Stream, '\\t')
    ;   write(Stream, Char)
    ),
    write_escaped_chars(Stream, Rest).

%% write_json_list(+Stream, +List)
%  Write a list as JSON array
write_json_list(Stream, List) :-
    write(Stream, '['),
    write_json_list_items(Stream, List),
    write(Stream, ']').

%% write_json_list_items(+Stream, +Items)
%  Write list items with comma separation
write_json_list_items(_, []).
write_json_list_items(Stream, [Item]) :-
    !,
    write_json_term(Stream, Item).
write_json_list_items(Stream, [Item|Rest]) :-
    write_json_term(Stream, Item),
    write(Stream, ', '),
    write_json_list_items(Stream, Rest).
