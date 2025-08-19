// Core protocol messages
export interface ProtocolMessage {
  seq: number;
  type: "request" | "response" | "event";
}

// Command and event enums for stronger typing
export type DapCommand =
  | "initialize"
  | "configurationDone"
  | "launch"
  | "attach"
  | "restart"
  | "disconnect"
  | "terminate"
  | "setBreakpoints"
  | "setFunctionBreakpoints"
  | "setExceptionBreakpoints"
  | "continue"
  | "next"
  | "stepIn"
  | "stepOut"
  | "stepBack"
  | "reverseContinue"
  | "restartFrame"
  | "goto"
  | "pause"
  | "stackTrace"
  | "scopes"
  | "variables"
  | "setVariable"
  | "source"
  | "threads"
  | "modules"
  | "loadedSources"
  | "evaluate"
  | "exceptionInfo";

export type DapEventName =
  | "initialized"
  | "stopped"
  | "continued"
  | "exited"
  | "terminated"
  | "thread"
  | "output"
  | "breakpoint"
  | "module"
  | "loadedSource"
  | "process"
  | "capabilities"
  | "progressStart"
  | "progressUpdate"
  | "progressEnd"
  | "invalidated"
  | "memory";

// Generic request/response/event shells that are strongly typed by mappings below
export interface Request<C extends DapCommand = DapCommand> extends ProtocolMessage {
  type: "request";
  command: C;
  arguments?: RequestArgumentsMap[C];
}

export interface Response<C extends DapCommand = DapCommand> extends ProtocolMessage {
  type: "response";
  request_seq: number;
  success: boolean;
  command: C;
  message?: string;
  body?: C extends keyof ResponseBodyMap ? ResponseBodyMap[C] : unknown;
}

export interface Event<E extends DapEventName = DapEventName> extends ProtocolMessage {
  type: "event";
  event: E;
  body?: EventBodyMap[E];
}

export type DapMessage =
  | Request
  | Response
  | Event;

export interface InitializeRequestArguments {
  clientID?: string;
  clientName?: string;
  adapterID: string;
  locale?: string;
  linesStartAt1?: boolean;
  columnsStartAt1?: boolean;
  pathFormat?: "path" | "uri";
  supportsVariableType?: boolean;
  supportsVariablePaging?: boolean;
  supportsRunInTerminalRequest?: boolean;
  supportsMemoryReferences?: boolean;
  supportsProgressReporting?: boolean;
  supportsInvalidatedEvent?: boolean;
  supportsMemoryEvent?: boolean;
  supportsArgsCanBeInterpretedByShell?: boolean;
  supportsStartDebuggingRequest?: boolean;
}

export interface Capabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  exceptionBreakpointFilters?: ExceptionBreakpointsFilter[];
  supportsStepBack?: boolean;
  supportsSetVariable?: boolean;
  supportsRestartFrame?: boolean;
  supportsGotoTargetsRequest?: boolean;
  supportsStepInTargetsRequest?: boolean;
  supportsCompletionsRequest?: boolean;
  completionTriggerCharacters?: string[];
  supportsModulesRequest?: boolean;
  additionalModuleColumns?: ColumnDescriptor[];
  supportedChecksumAlgorithms?: ChecksumAlgorithm[];
  supportsRestartRequest?: boolean;
  supportsExceptionOptions?: boolean;
  supportsValueFormattingOptions?: boolean;
  supportsExceptionInfoRequest?: boolean;
  supportTerminateDebuggee?: boolean;
  supportSuspendDebuggee?: boolean;
  supportsDelayedStackTraceLoading?: boolean;
  supportsLoadedSourcesRequest?: boolean;
  supportsLogPoints?: boolean;
  supportsTerminateThreadsRequest?: boolean;
  supportsSetExpression?: boolean;
  supportsTerminateRequest?: boolean;
  supportsDataBreakpoints?: boolean;
  supportsReadMemoryRequest?: boolean;
  supportsWriteMemoryRequest?: boolean;
  supportsDisassembleRequest?: boolean;
  supportsCancelRequest?: boolean;
  supportsBreakpointLocationsRequest?: boolean;
  supportsClipboardContext?: boolean;
  supportsSteppingGranularity?: boolean;
  supportsInstructionBreakpoints?: boolean;
  supportsExceptionFilterOptions?: boolean;
  supportsSingleThreadExecutionRequests?: boolean;
  supportsRenameVariable?: boolean;
}

export interface ExceptionBreakpointsFilter {
  filter: string;
  label: string;
  description?: string;
  default?: boolean;
  supportsCondition?: boolean;
  conditionDescription?: string;
}

export interface ColumnDescriptor {
  attributeName: string;
  label: string;
  format?: string;
  type?: "string" | "number" | "boolean" | "unixTimestampUTC";
  width?: number;
}

export type ChecksumAlgorithm = "MD5" | "SHA1" | "SHA256" | "timestamp";

export interface Thread {
  id: number;
  name: string;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  canRestart?: boolean;
  instructionPointerReference?: string;
  moduleId?: number | string;
  presentationHint?: "normal" | "label" | "subtle";
}

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
  presentationHint?: "normal" | "emphasize" | "deemphasize";
  origin?: string;
  sources?: Source[];
  adapterData?: any;
  checksums?: Checksum[];
}

export interface Checksum {
  algorithm: ChecksumAlgorithm;
  checksum: string;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  instructionReference?: string;
  offset?: number;
}

export interface SourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface StoppedEventBody {
  reason:
    | "step"
    | "breakpoint"
    | "exception"
    | "pause"
    | "entry"
    | "goto"
    | "function breakpoint"
    | "data breakpoint"
    | "instruction breakpoint"
    | string;
  description?: string;
  threadId?: number;
  preserveFocusHint?: boolean;
  text?: string;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
}

export interface ContinuedEventBody {
  threadId: number;
  allThreadsContinued?: boolean;
}

export interface OutputEventBody {
  category?:
    | "console"
    | "important"
    | "stdout"
    | "stderr"
    | "telemetry"
    | string;
  output: string;
  group?: "start" | "startCollapsed" | "end";
  variablesReference?: number;
  source?: Source;
  line?: number;
  column?: number;
  data?: any;
}

export interface TerminatedEventBody {
  restart?: any;
}

export interface InitializedEvent {}

export interface ExitedEventBody {
  exitCode: number;
}

export interface BreakpointEventBody {
  reason: "changed" | "new" | "removed";
  breakpoint: Breakpoint;
}

export interface Scope {
  name: string;
  presentationHint?: "arguments" | "locals" | "registers" | string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  presentationHint?: VariablePresentationHint;
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface VariablePresentationHint {
  kind?:
    | "property"
    | "method"
    | "class"
    | "data"
    | "event"
    | "baseClass"
    | "innerClass"
    | "interface"
    | "mostDerivedClass"
    | "virtual"
    | "dataBreakpoint"
    | string;
  attributes?: (
    | "static"
    | "constant"
    | "readOnly"
    | "rawString"
    | "hasObjectId"
    | "canHaveObjectId"
    | "hasSideEffects"
    | "hasDataBreakpoint"
    | string
  )[];
  visibility?:
    | "public"
    | "private"
    | "protected"
    | "internal"
    | "final"
    | string;
  lazy?: boolean;
}

export interface LaunchRequestArguments {
  noDebug?: boolean;
  __restart?: any;
  [key: string]: any;
}

export interface AttachRequestArguments {
  __restart?: any;
  [key: string]: any;
}

export interface DisconnectRequestArguments {
  restart?: boolean;
  terminateDebuggee?: boolean;
  suspendDebuggee?: boolean;
}

export interface SetBreakpointsArguments {
  source: Source;
  breakpoints?: SourceBreakpoint[];
  lines?: number[];
  sourceModified?: boolean;
}

export interface SetBreakpointsResponseBody {
  breakpoints: Breakpoint[];
}

export interface ContinueArguments {
  threadId: number;
  singleThread?: boolean;
}

export interface ContinueResponseBody {
  allThreadsContinued?: boolean;
}

export interface NextArguments {
  threadId: number;
  singleThread?: boolean;
  granularity?: SteppingGranularity;
}

export interface StepInArguments {
  threadId: number;
  singleThread?: boolean;
  targetId?: number;
  granularity?: SteppingGranularity;
}

export interface StepOutArguments {
  threadId: number;
  singleThread?: boolean;
  granularity?: SteppingGranularity;
}

export type SteppingGranularity = "statement" | "line" | "instruction";

export interface StackTraceArguments {
  threadId: number;
  startFrame?: number;
  levels?: number;
  format?: StackFrameFormat;
}

export interface StackFrameFormat {
  parameters?: boolean;
  parameterTypes?: boolean;
  parameterNames?: boolean;
  parameterValues?: boolean;
  line?: boolean;
  module?: boolean;
  includeAll?: boolean;
}

export interface StackTraceResponseBody {
  stackFrames: StackFrame[];
  totalFrames?: number;
}

export interface ScopesArguments {
  frameId: number;
}

export interface ScopesResponseBody {
  scopes: Scope[];
}

export interface VariablesArguments {
  variablesReference: number;
  filter?: "indexed" | "named";
  start?: number;
  count?: number;
  format?: ValueFormat;
}

export interface ValueFormat {
  hex?: boolean;
}

export interface VariablesResponseBody {
  variables: Variable[];
}

export interface EvaluateArguments {
  expression: string;
  frameId?: number;
  context?: "watch" | "repl" | "hover" | "clipboard" | "variables" | string;
  format?: ValueFormat;
}

export interface EvaluateResponseBody {
  result: string;
  type?: string;
  presentationHint?: VariablePresentationHint;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface PauseArguments {
  threadId: number;
}

export interface TerminateArguments {
  restart?: boolean;
}

export interface ThreadsResponseBody {
  threads: Thread[];
}

export interface ModulesArguments {
  startModule?: number;
  moduleCount?: number;
}

export interface Module {
  id: number | string;
  name: string;
  path?: string;
  isOptimized?: boolean;
  isUserCode?: boolean;
  version?: string;
  symbolStatus?: string;
  symbolFilePath?: string;
  dateTimeStamp?: string;
  addressRange?: string;
}

export interface ModulesResponseBody {
  modules: Module[];
  totalModules?: number;
}

export interface LoadedSourcesResponseBody {
  sources: Source[];
}

export interface SourceArguments {
  source?: Source;
  sourceReference: number;
}

export interface SourceResponseBody {
  content: string;
  mimeType?: string;
}

export interface SetExceptionBreakpointsArguments {
  filters: string[];
  filterOptions?: ExceptionFilterOptions[];
  exceptionOptions?: ExceptionOptions[];
}

export interface ExceptionFilterOptions {
  filterId: string;
  condition?: string;
}

export interface ExceptionOptions {
  path?: ExceptionPathSegment[];
  breakMode: ExceptionBreakMode;
}

export interface ExceptionPathSegment {
  negate?: boolean;
  names: string[];
}

export type ExceptionBreakMode =
  | "never"
  | "always"
  | "unhandled"
  | "userUnhandled";

export interface ExceptionInfoArguments {
  threadId: number;
}

export interface ExceptionDetails {
  message?: string;
  typeName?: string;
  fullTypeName?: string;
  evaluateName?: string;
  stackTrace?: string;
  innerException?: ExceptionDetails[];
}

export interface ExceptionInfoResponseBody {
  exceptionId: string;
  description?: string;
  breakMode: ExceptionBreakMode;
  details?: ExceptionDetails;
}

// Request/response/event mappings
export interface RequestArgumentsMap {
  initialize: InitializeRequestArguments;
  configurationDone: {} | undefined;
  launch: LaunchRequestArguments;
  attach: AttachRequestArguments;
  restart: RestartArguments | undefined;
  disconnect: DisconnectRequestArguments | undefined;
  terminate: TerminateArguments | undefined;
  setBreakpoints: SetBreakpointsArguments;
  setFunctionBreakpoints: SetFunctionBreakpointsArguments;
  setExceptionBreakpoints: SetExceptionBreakpointsArguments;
  continue: ContinueArguments;
  next: NextArguments;
  stepIn: StepInArguments;
  stepOut: StepOutArguments;
  stepBack: StepBackArguments;
  reverseContinue: ReverseContinueArguments;
  restartFrame: RestartFrameArguments;
  goto: GotoArguments;
  pause: PauseArguments;
  stackTrace: StackTraceArguments;
  scopes: ScopesArguments;
  variables: VariablesArguments;
  setVariable: SetVariableArguments;
  source: SourceArguments;
  threads: {} | undefined;
  modules: ModulesArguments | undefined;
  loadedSources: {} | undefined;
  evaluate: EvaluateArguments;
  exceptionInfo: ExceptionInfoArguments;
}

export interface ResponseBodyMap {
  initialize: Capabilities;
  setBreakpoints: SetBreakpointsResponseBody;
  continue: ContinueResponseBody;
  stackTrace: StackTraceResponseBody;
  scopes: ScopesResponseBody;
  variables: VariablesResponseBody;
  evaluate: EvaluateResponseBody;
  threads: ThreadsResponseBody;
  modules: ModulesResponseBody;
  loadedSources: LoadedSourcesResponseBody;
  source: SourceResponseBody;
  exceptionInfo: ExceptionInfoResponseBody;
}

export interface EventBodyMap {
  initialized: InitializedEvent | undefined;
  stopped: StoppedEventBody;
  continued: ContinuedEventBody;
  exited: ExitedEventBody;
  terminated: TerminatedEventBody | undefined;
  thread: ThreadEventBody;
  output: OutputEventBody;
  breakpoint: BreakpointEventBody;
  module: ModuleEventBody;
  loadedSource: LoadedSourceEventBody;
  process: ProcessEventBody;
  capabilities: CapabilitiesEventBody;
  progressStart: ProgressStartEventBody;
  progressUpdate: ProgressUpdateEventBody;
  progressEnd: ProgressEndEventBody;
  invalidated: InvalidatedEventBody;
  memory: MemoryEventBody;
}

export interface RestartArguments {
  arguments?: LaunchRequestArguments | AttachRequestArguments;
}

export interface SetFunctionBreakpointsArguments {
  breakpoints: FunctionBreakpoint[];
}

export interface FunctionBreakpoint {
  name: string;
  condition?: string;
  hitCondition?: string;
}

export interface SetFunctionBreakpointsResponseBody {
  breakpoints: Breakpoint[];
}

export interface StepBackArguments {
  threadId: number;
  singleThread?: boolean;
  granularity?: SteppingGranularity;
}

export interface ReverseContinueArguments {
  threadId: number;
  singleThread?: boolean;
}

export interface RestartFrameArguments {
  frameId: number;
}

export interface GotoArguments {
  threadId: number;
  targetId: number;
}

export interface SetVariableArguments {
  variablesReference: number;
  name: string;
  value: string;
  format?: ValueFormat;
}

export interface SetVariableResponseBody {
  value: string;
  type?: string;
  variablesReference?: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface ThreadEventBody {
  reason: "started" | "exited";
  threadId: number;
}

export interface ModuleEventBody {
  reason: "new" | "changed" | "removed";
  module: Module;
}

export interface LoadedSourceEventBody {
  reason: "new" | "changed" | "removed";
  source: Source;
}

export interface ProcessEventBody {
  name: string;
  systemProcessId?: number;
  isLocalProcess?: boolean;
  startMethod?: "launch" | "attach" | "attachForSuspendedLaunch";
  pointerSize?: number;
}

export interface CapabilitiesEventBody {
  capabilities: Capabilities;
}

export interface ProgressStartEventBody {
  progressId: string;
  title: string;
  requestId?: number;
  cancellable?: boolean;
  message?: string;
  percentage?: number;
}

export interface ProgressUpdateEventBody {
  progressId: string;
  message?: string;
  percentage?: number;
}

export interface ProgressEndEventBody {
  progressId: string;
  message?: string;
}

export interface InvalidatedEventBody {
  areas?: InvalidatedAreas[];
  threadId?: number;
  stackFrameId?: number;
}

export type InvalidatedAreas = "all" | "stacks" | "threads" | "variables";

export interface MemoryEventBody {
  memoryReference: string;
  offset: number;
  count: number;
}
