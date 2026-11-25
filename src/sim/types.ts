export type XRayMaterial = 'organic' | 'mixed' | 'metal' | 'dense';

export type XRayMode = 'STD' | 'OS' | 'MS' | 'INV';

export type BeltState = 'FWD' | 'STOP' | 'REV';

export type CameraStation = 'overview' | 'documents' | 'xray';

export type HairStyle =
  | 'short'
  | 'parted'
  | 'buzz'
  | 'long'
  | 'curly'
  | 'bald'
  | 'cap'
  | 'beanie';

export type FacialHair = 'none' | 'stubble' | 'beard' | 'mustache';

export type GlassesStyle = 'none' | 'rectangular' | 'round' | 'aviator';

export type JacketStyle = 'blazer' | 'hoodie' | 'bomber' | 'coat' | 'polo';

export interface PassengerAppearance {
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  facialHair: FacialHair;
  glasses: GlassesStyle;
  jacketStyle: JacketStyle;
  jacketColor: string;
  shirtColor: string;
  hatColor: string;
  eyeColor: string;
  heightScale: number;
  buildScale: number;
  genderPresentation: 'M' | 'F';
}

export type BagType = 'hardshell' | 'duffel' | 'backpack' | 'briefcase';

export interface XRayLayerShape {
  kind: 'rect' | 'roundRect' | 'circle' | 'ellipse' | 'polygon' | 'line';
  material: XRayMaterial;
  /** Optical density thickness (0.15 = faint fabric, 0.95 = dense steel, 1.35 = lead) */
  density: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
  ry?: number;
  points?: Array<[number, number]>;
  lineWidth?: number;
}

export interface ItemTemplate {
  id: string;
  name: string;
  category: 'legal' | 'weapon' | 'explosive' | 'liquid' | 'chemical' | 'blunt';
  contraband: boolean;
  /** Minimum shift level where this contraband item can appear */
  minLevel: number;
  width: number;
  height: number;
  hint: string;
  shapes: XRayLayerShape[];
}

export interface BagItemInstance {
  instanceId: string;
  template: ItemTemplate;
  /** Center X in bag-local normalized coordinates (0..bagWidth) */
  x: number;
  /** Center Y in bag-local normalized coordinates (0..bagHeight) */
  y: number;
  /** Rotation in radians */
  rotation: number;
  scale: number;
  flagged: boolean;
}

export interface BagData {
  id: string;
  type: BagType;
  color: string;
  accentColor: string;
  /** X-ray canvas local dimensions */
  width: number;
  height: number;
  items: BagItemInstance[];
  hasLeadLining: boolean;
}

export interface IdentityDocument {
  type: 'PASSPORT' | 'DRIVER_LICENSE';
  fullName: string;
  dob: string;
  issueDate: string;
  expiryDate: string;
  docNumber: string;
  issuingAuthority: string;
  nationality: string;
  sex: 'M' | 'F';
  photoAppearance: PassengerAppearance;
  uvValid: boolean;
  uvSealCode: string;
}

export interface BoardingPass {
  passengerName: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  destinationCity: string;
  gate: string;
  seat: string;
  flightDate: string;
  boardingGroup: string;
  sequenceNo: string;
  tsaPre: boolean;
}

export type ViolationCode =
  | 'EXPIRED_ID'
  | 'NAME_MISMATCH'
  | 'WRONG_DATE'
  | 'PHOTO_MISMATCH'
  | 'FORGED_UV'
  | 'WATCHLIST_HIT'
  | 'CONTRABAND_ITEM';

export interface Violation {
  code: ViolationCode;
  label: string;
  detail: string;
  source: 'id' | 'xray';
}

export interface WatchlistEntry {
  name: string;
  docNumber: string;
  reason: string;
  threatLevel: 'HIGH' | 'CRITICAL';
}

export interface PassengerCase {
  id: string;
  index: number;
  appearance: PassengerAppearance;
  document: IdentityDocument;
  boardingPass: BoardingPass;
  bag: BagData;
  violations: Violation[];
  /** Dialogue snippet spoken when stepping up to the checkpoint */
  greeting: string;
  /** Subtle nervous tell or normal posture */
  nervousness: number;
}

export type DecisionAction = 'CLEAR' | 'DENY_ID' | 'CONFISCATE_DETAIN';

export interface DecisionEvaluation {
  correct: boolean;
  partial: boolean;
  action: DecisionAction;
  xpDelta: number;
  creditsDelta: number;
  headline: string;
  explanation: string;
  missedViolations: Violation[];
  caughtViolations: Violation[];
  falseFlagCount: number;
}

export type UpgradeId = 'densityProbe' | 'highSpeedBelt' | 'wideUvLamp' | 'watchlistAlert';

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  cost: number;
  description: string;
  badge: string;
}

export interface ShiftConfig {
  level: number;
  title: string;
  rankTitle: string;
  dateISO: string;
  dateDisplay: string;
  terminalGate: string;
  passengerQuota: number;
  contrabandChance: number;
  idViolationChance: number;
  bagClutterRange: [number, number];
  allowUvForgery: boolean;
  allowPhotoMismatch: boolean;
  allowWatchlist: boolean;
  allowLeadLining: boolean;
  briefingRules: string[];
}

export interface AirMarshalRank {
  level: number;
  title: string;
  xpRequired: number;
  badgeCode: string;
}

export interface PlayerProgress {
  level: number;
  xp: number;
  credits: number;
  totalProcessed: number;
  totalCorrect: number;
  contrabandSeized: number;
  forgeriesCaught: number;
  streak: number;
  bestStreak: number;
  upgrades: Record<UpgradeId, boolean>;
  airMarshalUnlocked: boolean;
}
