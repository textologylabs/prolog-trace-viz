/**
 * Timeline Builder - Constructs a nested timeline tree from trace events
 * 
 * Child calls are embedded inside their parent steps, creating a visual
 * representation of the call stack depth.
 */

import { SourceClauseMap } from './clauses.js';
import { VariableBindingTracker } from './variable-tracker.js';

export interface TimelineStep {
  stepNumber: number;
  port: 'call' | 'exit' | 'redo' | 'fail' | 'merged';
  level: number;
  goal: string;
  clause?: {
    head: string;
    body: string;
    line: number;
  };
  unifications: Array<{
    variable: string;
    value: string;
  }>;
  subgoals: Array<{
    label: string;          // e.g., "[1.1]", "[1.2]"
    goal: string;
  }>;
  subgoalLabel?: string;    // e.g., "[1.1]" - which subgoal this step is solving
  subgoalTemplate?: string; // Original subgoal template from parent (e.g., "t(X1+1, Z)")
  subgoalInstantiated?: string; // Instantiated form from parent (e.g., "t(1+0+1, _2008)") - preserves parent's internal vars
  subgoalBindings?: Array<{ variable: string; value: string; fromStep: number }>; // Bindings applied to reach this goal
  result?: string;          // For merged steps: the result value
  queryVarState?: string;   // State of the query variable at this step
  children: TimelineStep[]; // Nested child steps
}

/**
 * Flatten a nested timeline tree into a flat array (depth-first order)
 * Useful for tests and backward compatibility
 */
export function flattenTimeline(steps: TimelineStep[]): TimelineStep[] {
  const result: TimelineStep[] = [];
  
  const flatten = (stepList: TimelineStep[]): void => {
    for (const step of stepList) {
      result.push(step);
      flatten(step.children);
    }
  };
  
  flatten(steps);
  return result;
}

export interface TraceEvent {
  port: 'call' | 'exit' | 'redo' | 'fail';
  level: number;
  goal: string;
  predicate: string;
  arguments?: any[];
  clause?: {
    head: string;
    body: string;
    line: number;
  };
  parent_info?: {
    level: number;
    goal: string;
  };
}

/**
 * Timeline Builder class - processes trace events into nested timeline steps
 */
export class TimelineBuilder {
  private steps: TimelineStep[] = [];
  private stepCounter = 0;
  private callStack: Map<number, number> = new Map(); // level -> step number
  private stepMap: Map<number, TimelineStep> = new Map(); // step number -> step object
  private activeCallStack: TimelineStep[] = []; // Stack of currently active (unresolved) calls

  constructor(
    private events: TraceEvent[],
    private sourceClauseMap?: SourceClauseMap,
    private originalQuery?: string
  ) {}

  /**
   * Check if a predicate is part of tracer infrastructure and should be filtered
   */
  private isTracerPredicate(predicate: string): boolean {
    const tracerPredicates = [
      'catch/3',
      'export_trace_json/1',
      'run_trace/0',
      'install_tracer/1',
      'remove_tracer/0',
    ];
    return tracerPredicates.includes(predicate);
  }

  /**
   * Build the complete timeline from trace events
   * Returns root-level steps with children nested inside
   */
  build(): TimelineStep[] {
    // Initialize binding tracker if we have original query
    let bindingTracker: VariableBindingTracker | undefined;
    if (this.originalQuery) {
      bindingTracker = new VariableBindingTracker(this.originalQuery);
    }
    
    // Process all events to build nested tree
    for (const event of this.events) {
      if (this.isTracerPredicate(event.predicate)) continue;
      
      // Process event in binding tracker
      if (bindingTracker) {
        bindingTracker.processEvent(event);
      }
      
      this.processEvent(event, bindingTracker);
    }
    
    // Renumber steps in depth-first order for consistent numbering
    this.renumberStepsDepthFirst();
    
    return this.steps;
  }

  /**
   * Process a single event and build nested structure
   */
  private processEvent(event: TraceEvent, bindingTracker?: VariableBindingTracker): void {
    switch (event.port) {
      case 'call':
        this.processCall(event, bindingTracker);
        break;
      case 'exit':
        this.processExit(event, bindingTracker);
        break;
      case 'redo':
        this.processRedo(event);
        break;
      case 'fail':
        this.processFail(event);
        break;
    }
  }

  /**
   * Process CALL event - create new step and push to active stack
   */
  private processCall(event: TraceEvent, bindingTracker?: VariableBindingTracker): void {
    this.stepCounter++;
    const stepNumber = this.stepCounter;
    
    // Get clause info (prefer source clause)
    let clauseInfo = event.clause;
    if (clauseInfo && this.sourceClauseMap) {
      const sourceClause = this.getSourceClause(clauseInfo.line);
      if (sourceClause) {
        clauseInfo = {
          head: sourceClause.head,
          body: sourceClause.body || 'true',
          line: sourceClause.number,
        };
      }
    }
    
    // Extract pattern match bindings
    const unifications: Array<{ variable: string; value: string }> = [];
    if (clauseInfo) {
      const patternBindings = this.extractPatternMatchBindings(event.goal, clauseInfo.head);
      unifications.push(...patternBindings);
    }
    
    // Extract subgoals from clause body
    const subgoals: Array<{ label: string; goal: string }> = [];
    if (clauseInfo && clauseInfo.body && clauseInfo.body !== 'true') {
      const subgoalGoals = this.extractSubgoals(clauseInfo.body);
      subgoalGoals.forEach((goal, index) => {
        subgoals.push({
          label: `[${stepNumber}.${index + 1}]`,
          goal,
        });
      });
    }
    
    // Get parent for nesting (subgoalLabel assigned later in renumberStepsDepthFirst)
    const parent = this.activeCallStack[this.activeCallStack.length - 1];
    
    // Create the step
    const step: TimelineStep = {
      stepNumber,
      port: 'call',
      level: event.level,
      goal: event.goal,
      clause: clauseInfo,
      unifications,
      subgoals,
      children: [],
    };
    
    // Update subgoal display with instantiation
    if (step.subgoals.length > 0 && step.unifications.length > 0) {
      step.subgoals = step.subgoals.map(subgoal => ({
        label: subgoal.label,
        goal: this.formatSubgoalWithInstantiation(subgoal.goal, step.unifications),
      }));
    }
    
    // Store in map for later reference
    this.stepMap.set(stepNumber, step);
    this.callStack.set(event.level, stepNumber);
    
    // Add to parent's children or to root steps
    if (parent) {
      parent.children.push(step);
    } else {
      this.steps.push(step);
    }
    
    // Push to active stack
    this.activeCallStack.push(step);
  }

  /**
   * Process EXIT event - merge with CALL and pop from stack
   */
  private processExit(event: TraceEvent, bindingTracker?: VariableBindingTracker): void {
    const callStepNumber = this.callStack.get(event.level);
    if (!callStepNumber) return;
    
    const step = this.stepMap.get(callStepNumber);
    if (!step) return;
    
    // Backfill clause info from EXIT if CALL didn't have it
    if (!step.clause && event.clause) {
      let clauseInfo = event.clause;
      
      // Prefer source clause if available
      if (this.sourceClauseMap) {
        const sourceClause = this.getSourceClause(event.clause.line);
        if (sourceClause) {
          clauseInfo = {
            head: sourceClause.head,
            body: sourceClause.body || 'true',
            line: sourceClause.number,
          };
        }
      }
      
      step.clause = clauseInfo;
      
      // Extract pattern match bindings now that we have clause info
      const patternBindings = this.extractPatternMatchBindings(step.goal, clauseInfo.head);
      step.unifications = patternBindings;
      
      // Extract subgoals if clause has a body
      if (clauseInfo.body && clauseInfo.body !== 'true') {
        const subgoalGoals = this.extractSubgoals(clauseInfo.body);
        step.subgoals = subgoalGoals.map((goal, index) => ({
          label: `[${step.stepNumber}.${index + 1}]`,
          goal: this.formatSubgoalWithInstantiation(goal, step.unifications),
        }));
      }
    }
    
    // Merge: convert to 'merged' and add result
    step.port = 'merged';
    step.result = this.extractResult(event.goal);
    
    // Get query variable state
    if (bindingTracker) {
      const queryVarState = bindingTracker.getQueryVarState(event.level);
      if (queryVarState) {
        step.queryVarState = queryVarState;
      }
    }
    
    // Pop from active stack
    this.activeCallStack.pop();
    this.callStack.delete(event.level);
  }

  /**
   * Process REDO event - the goal at this level is backtracking into a
   * different clause. The children accumulated so far belong to the clause
   * attempt that just failed, so discard them: the surviving children must
   * align with the clause that ultimately succeeds (backfilled at EXIT).
   */
  private processRedo(event: TraceEvent): void {
    const callStepNumber = this.callStack.get(event.level);
    if (callStepNumber === undefined) return;

    const step = this.stepMap.get(callStepNumber);
    if (!step) return;

    // Drop the failed clause attempt's subgoal steps.
    step.children = [];

    // A redo invalidates any clause/unification info from the failed attempt
    // so it can be re-derived cleanly from the next CALL/EXIT.
    step.clause = undefined;
    step.unifications = [];
    step.subgoals = [];
  }

  /**
   * Process FAIL event
   */
  private processFail(event: TraceEvent): void {
    this.stepCounter++;
    const stepNumber = this.stepCounter;
    
    const step: TimelineStep = {
      stepNumber,
      port: 'fail',
      level: event.level,
      goal: event.goal,
      unifications: [],
      subgoals: [],
      children: [],
    };
    
    const parent = this.activeCallStack[this.activeCallStack.length - 1];
    if (parent) {
      parent.children.push(step);
    } else {
      this.steps.push(step);
    }
    
    this.activeCallStack.pop();
    this.callStack.delete(event.level);
  }

  /**
   * Renumber steps in depth-first order for consistent display
   * Also assigns subgoalLabel and subgoalTemplate to children now that clause info is backfilled
   * Computes subgoalBindings by comparing template to actual goal
   */
  private renumberStepsDepthFirst(): void {
    let counter = 0;
    
    const renumber = (steps: TimelineStep[], parent?: TimelineStep): void => {
      // Track results from previous siblings for binding context
      const siblingResults: Map<string, { value: string; stepNumber: number }> = new Map();
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        counter++;
        step.stepNumber = counter;
        
        // Update subgoal labels to use new step number
        if (step.subgoals.length > 0) {
          step.subgoals = step.subgoals.map((subgoal, index) => ({
            label: `[${step.stepNumber}.${index + 1}]`,
            goal: subgoal.goal,
          }));
        }
        
        // Assign subgoalLabel and template based on parent's subgoals (now that clause info is backfilled)
        if (parent && parent.subgoals.length > 0 && i < parent.subgoals.length) {
          step.subgoalLabel = parent.subgoals[i].label;
          
          // Extract template from parent's subgoal (format: "template → instantiated" or just "template")
          const subgoalGoal = parent.subgoals[i].goal;
          const arrowIndex = subgoalGoal.indexOf(' → ');
          if (arrowIndex !== -1) {
            step.subgoalTemplate = subgoalGoal.slice(0, arrowIndex);
            step.subgoalInstantiated = subgoalGoal.slice(arrowIndex + 3);
          } else {
            step.subgoalTemplate = subgoalGoal;
          }
          
          // Compute bindings applied to reach this goal from template
          step.subgoalBindings = this.computeSubgoalBindings(
            step.subgoalTemplate,
            step.goal,
            siblingResults
          );
        }
        
        // Track this step's result for subsequent siblings
        if (step.result && step.subgoalTemplate) {
          // Extract variable names from template that might be used by later subgoals
          const templateVars = this.extractVariablesFromTerm(step.subgoalTemplate);
          // The output variable is typically the last argument
          const outputVar = this.extractOutputVariable(step.subgoalTemplate);
          if (outputVar) {
            siblingResults.set(outputVar, { value: step.result, stepNumber: step.stepNumber });
          }
        }
        
        // Recursively renumber children
        renumber(step.children, step);
      }
    };
    
    renumber(this.steps);
  }

  /**
   * Compute bindings that were applied to transform template into actual goal
   */
  private computeSubgoalBindings(
    template: string,
    actualGoal: string,
    siblingResults: Map<string, { value: string; stepNumber: number }>
  ): Array<{ variable: string; value: string; fromStep: number }> {
    const bindings: Array<{ variable: string; value: string; fromStep: number }> = [];
    
    // Extract variables from template
    const templateVars = this.extractVariablesFromTerm(template);
    
    // For each variable, check if it was bound by a sibling result
    for (const varName of templateVars) {
      const siblingResult = siblingResults.get(varName);
      if (siblingResult) {
        bindings.push({
          variable: varName,
          value: siblingResult.value,
          fromStep: siblingResult.stepNumber,
        });
      }
    }
    
    return bindings;
  }

  /**
   * Extract variable names from a term (variables start with uppercase or _)
   */
  private extractVariablesFromTerm(term: string): string[] {
    const vars: string[] = [];
    // Match variable names: start with uppercase letter or underscore, followed by alphanumeric/underscore
    const regex = /\b([A-Z_][A-Za-z0-9_]*)\b/g;
    let match;
    while ((match = regex.exec(term)) !== null) {
      const varName = match[1];
      // Skip anonymous variables and already-seen variables
      if (varName !== '_' && !vars.includes(varName)) {
        vars.push(varName);
      }
    }
    return vars;
  }

  /**
   * Extract the output variable from a goal template (typically the last argument)
   */
  private extractOutputVariable(template: string): string | null {
    const match = template.match(/^[^(]+\((.+)\)$/);
    if (!match) return null;
    
    const args = this.splitArguments(match[1]);
    if (args.length === 0) return null;
    
    // The output is typically the last argument - check if it's a variable
    const lastArg = args[args.length - 1].trim();
    if (/^[A-Z_][A-Za-z0-9_]*$/.test(lastArg)) {
      return lastArg;
    }
    
    return null;
  }

  /**
   * Get source clause from the source clause map
   */
  private getSourceClause(lineNumber: number): { head: string; body?: string; number: number } | null {
    if (!this.sourceClauseMap) return null;
    
    const clause = this.sourceClauseMap[lineNumber];
    if (!clause) return null;
    
    return {
      head: clause.head,
      body: clause.body,
      number: clause.number,
    };
  }

  /**
   * Extract subgoals from a clause body
   */
  private extractSubgoals(clauseBody: string): string[] {
    if (!clauseBody || clauseBody === 'true') return [];
    
    const subgoals: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of clauseBody) {
      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        subgoals.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      subgoals.push(current.trim());
    }
    
    return subgoals;
  }

  /**
   * Extract the result value from an EXIT goal.
   *
   * - Compound term `f(a, b, R)` -> the last argument is the result.
   * - `is/2` goal `6 is 16-10` -> the value bound to the LHS ("6").
   * - Comparison goals (`<`, `>=`, ...) bind nothing -> empty string, which
   *   suppresses the `=>` result line in the formatter.
   */
  private extractResult(exitGoal: string): string {
    const match = exitGoal.match(/^([^(]+)\((.*)\)$/);
    if (match) {
      const args = this.splitArguments(match[2]);
      return args[args.length - 1] || exitGoal;
    }

    const isMatch = exitGoal.match(/^(.+?)\s+is\s+(.+)$/);
    if (isMatch) return isMatch[1].trim();

    if (/(=<|>=|=:=|=\\=|<|>|==|\\==)/.test(exitGoal)) {
      return '';
    }

    return exitGoal;
  }

  /**
   * Format subgoal with instantiation
   */
  private formatSubgoalWithInstantiation(
    subgoalTemplate: string,
    unifications: Array<{ variable: string; value: string }>
  ): string {
    let instantiated = subgoalTemplate;
    
    for (const { variable, value } of unifications) {
      const regex = new RegExp(`\\b${variable}\\b`, 'g');
      instantiated = instantiated.replace(regex, value);
    }
    
    if (instantiated !== subgoalTemplate) {
      return `${subgoalTemplate} → ${instantiated}`;
    }
    
    return subgoalTemplate;
  }

  /**
   * Extract pattern match bindings by comparing goal with clause head
   */
  private extractPatternMatchBindings(
    goal: string,
    clauseHead: string
  ): Array<{ variable: string; value: string }> {
    const bindings: Array<{ variable: string; value: string }> = [];
    
    const goalMatch = goal.match(/^([^(]+)\((.*)\)$/);
    const headMatch = clauseHead.match(/^([^(]+)\((.*)\)$/);
    
    if (!goalMatch || !headMatch) return bindings;
    
    const goalArgs = this.splitArguments(goalMatch[2]);
    const headArgs = this.splitArguments(headMatch[2]);
    
    for (let i = 0; i < Math.min(goalArgs.length, headArgs.length); i++) {
      const goalArg = goalArgs[i].trim();
      const headArg = headArgs[i].trim();
      this.extractBindingsFromTermPair(headArg, goalArg, bindings);
    }
    
    return bindings;
  }

  /**
   * Recursively extract bindings by comparing pattern term with value term
   */
  private extractBindingsFromTermPair(
    pattern: string,
    value: string,
    bindings: Array<{ variable: string; value: string }>
  ): void {
    if (this.isSimpleVariable(pattern)) {
      bindings.push({ variable: pattern, value });
      return;
    }
    
    if (pattern === value) return;
    
    // Try operator decomposition
    const patternOp = this.findOperator(pattern);
    const valueOp = this.findOperator(value);
    
    if (patternOp && valueOp && patternOp.op === valueOp.op) {
      this.extractBindingsFromTermPair(patternOp.left, valueOp.left, bindings);
      this.extractBindingsFromTermPair(patternOp.right, valueOp.right, bindings);
      return;
    }
    
    // Try list decomposition
    if (pattern.startsWith('[') && value.startsWith('[')) {
      const patternList = this.parseListPattern(pattern);
      const valueList = this.parseListPattern(value);
      
      if (patternList && valueList) {
        if (patternList.head && valueList.head) {
          this.extractBindingsFromTermPair(patternList.head, valueList.head, bindings);
        }
        if (patternList.tail && valueList.tail) {
          this.extractBindingsFromTermPair(patternList.tail, valueList.tail, bindings);
        }
      }
    }
  }

  private isSimpleVariable(term: string): boolean {
    return /^[A-Z_][A-Za-z0-9_]*$/.test(term);
  }

  private findOperator(term: string): { op: string; left: string; right: string } | null {
    const operators = ['+', '-', '*', '/'];
    let depth = 0;
    
    for (let i = term.length - 1; i >= 0; i--) {
      const char = term[i];
      
      if (char === ')' || char === ']') depth++;
      else if (char === '(' || char === '[') depth--;
      else if (depth === 0 && operators.includes(char)) {
        return {
          op: char,
          left: term.slice(0, i).trim(),
          right: term.slice(i + 1).trim(),
        };
      }
    }
    
    return null;
  }

  private parseListPattern(list: string): { head: string; tail: string } | null {
    if (!list.startsWith('[') || !list.endsWith(']')) return null;
    
    const content = list.slice(1, -1).trim();
    
    const pipeIndex = content.indexOf('|');
    if (pipeIndex !== -1) {
      return {
        head: content.slice(0, pipeIndex).trim(),
        tail: content.slice(pipeIndex + 1).trim(),
      };
    }
    
    const commaIndex = content.indexOf(',');
    if (commaIndex !== -1) {
      return {
        head: content.slice(0, commaIndex).trim(),
        tail: `[${content.slice(commaIndex + 1).trim()}]`,
      };
    }
    
    if (content) {
      return { head: content, tail: '[]' };
    }
    
    return null;
  }

  private splitArguments(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of argsStr) {
      if (char === '(' || char === '[') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  }
}
