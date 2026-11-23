import {
  Bus,
  CircleCheck,
  CircleDot,
  CircleSlash,
  Construction,
  Droplets,
  Ellipsis,
  Footprints,
  Lightbulb,
  Search,
  Landmark,
  Signpost,
  Trash2,
  TreePine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  Bi,
  CategoryDef,
  ClosureReason,
  DistrictId,
  FlagReason,
  IconKey,
  LngLat,
  Priority,
  ReportStatus,
  SubcategoryDef,
} from "./types";

export const STATUS_ORDER: ReportStatus[] = [
  "reported",
  "investigating",
  "in_progress",
  "resolved",
  "closed",
];

export const OPEN_STATUSES: ReportStatus[] = ["reported", "investigating", "in_progress"];

export const STATUS_META: Record<
  ReportStatus,
  { label: Bi; icon: LucideIcon; publicMeaning: Bi; cssKey: string }
> = {
  reported: {
    label: { mn: "Мэдээлэгдсэн", en: "Reported" },
    icon: CircleDot,
    cssKey: "reported",
    publicMeaning: {
      mn: "Илгээгдсэн; хариуцах байгууллага хараахан шалгаагүй.",
      en: "Submitted; not yet reviewed by the responsible organization.",
    },
  },
  investigating: {
    label: { mn: "Шалгаж байна", en: "Investigating" },
    icon: Search,
    cssKey: "investigating",
    publicMeaning: {
      mn: "Байгууллага байршил, цар хүрээг шалгаж байна.",
      en: "The organization is checking the location and scope.",
    },
  },
  in_progress: {
    label: { mn: "Засварлаж байна", en: "In progress" },
    icon: Wrench,
    cssKey: "in-progress",
    publicMeaning: {
      mn: "Засвар эсвэл цэвэрлэгээ төлөвлөгдсөн буюу хийгдэж байна.",
      en: "Repair or clean-up is scheduled or under way.",
    },
  },
  resolved: {
    label: { mn: "Шийдвэрлэсэн", en: "Resolved" },
    icon: CircleCheck,
    cssKey: "resolved",
    publicMeaning: {
      mn: "Байгууллага зассан гэж мэдэгдсэн. Та баталгаажуулах эсвэл эсэргүүцэх боломжтой.",
      en: "The organization says it's fixed. You can confirm or dispute it.",
    },
  },
  closed: {
    label: { mn: "Хаасан", en: "Closed" },
    icon: CircleSlash,
    cssKey: "closed",
    publicMeaning: {
      mn: "Засваргүйгээр хаагдсан: давхардсан, хүчингүй эсвэл хамааралгүй.",
      en: "Closed without a fix: duplicate, invalid, or out of scope.",
    },
  },
};

export const CLOSURE_LABEL: Record<ClosureReason, Bi> = {
  duplicate: { mn: "Давхардсан", en: "Duplicate" },
  invalid: { mn: "Хүчингүй", en: "Invalid" },
  out_of_scope: { mn: "Хамааралгүй", en: "Out of scope" },
};

/** Lucide icons an admin can pick for a category. */
export const ICONS: Record<IconKey, LucideIcon> = {
  road: Construction,
  footprints: Footprints,
  lightbulb: Lightbulb,
  trash: Trash2,
  droplets: Droplets,
  landmark: Landmark,
  trees: TreePine,
  signpost: Signpost,
  zap: Zap,
  bus: Bus,
  ellipsis: Ellipsis,
};

const sub = (id: string, mn: string, en: string): SubcategoryDef => ({ id, name: { mn, en } });

/**
 * The category tree the seed starts from. In the database admins can rename, add, remove and
 * reorder categories and subcategories at /admin/categories.
 */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    id: "roads",
    name: { mn: "Зам, гудамж", en: "Roads and streets" },
    icon: "road",
    subcategories: [
      sub("pothole", "Замын нүх, эвдэрсэн хучилт", "Pothole or damaged road surface"),
      sub("cracked", "Хагарсан, эвдэрсэн хучилт", "Cracked or broken pavement"),
      sub("curb", "Эвдэрсэн хашлага чулуу", "Damaged curb"),
      sub("manhole", "Худгийн таг алга эсвэл эвдэрсэн", "Missing or damaged manhole cover"),
      sub("obstruction", "Замын саад", "Road obstruction"),
      sub("other", "Замын бусад асуудал", "Other road issue"),
    ],
  },
  {
    id: "sidewalks",
    name: { mn: "Явган хүний зам", en: "Sidewalks and pedestrian areas" },
    icon: "footprints",
    subcategories: [
      sub("uneven", "Эвдэрсэн, тэгш бус хавтан", "Broken or uneven pavement"),
      sub("blocked", "Хаагдсан явган зам", "Blocked sidewalk"),
      sub("tactile", "Эвдэрсэн хараагүй хүний зам", "Damaged tactile paving"),
      sub("crossing", "Аюултай явган хүний гарц", "Unsafe pedestrian crossing"),
      sub("other", "Явган замын бусад асуудал", "Other pedestrian-area issue"),
    ],
  },
  {
    id: "lighting",
    name: { mn: "Гэрэлтүүлэг, цахилгаан", en: "Street lighting and electricity" },
    icon: "lightbulb",
    subcategories: [
      sub("not_working", "Гудамжны гэрэл асахгүй", "Streetlight not working"),
      sub("broken", "Эвдэрсэн гэрэлтүүлэг", "Broken streetlight"),
      sub("wiring", "Ил гарсан цахилгаан утас", "Exposed electrical wiring"),
      sub("infrastructure", "Эвдэрсэн цахилгааны байгууламж", "Damaged electrical infrastructure"),
      sub("other", "Цахилгааны бусад асуудал", "Other electrical issue"),
    ],
  },
  {
    id: "waste",
    name: { mn: "Хог хаягдал, цэвэрлэгээ", en: "Waste and cleanliness" },
    icon: "trash",
    subcategories: [
      sub("overflowing", "Дүүрсэн хогийн сав", "Overflowing public bin"),
      sub("dumping", "Хууль бусаар хаясан хог", "Illegal dumping"),
      sub("uncollected", "Ачигдаагүй хог", "Uncollected waste"),
      sub("dirty", "Бохир нийтийн талбай", "Dirty public area"),
      sub("other", "Хог хаягдлын бусад асуудал", "Other waste issue"),
    ],
  },
  {
    id: "water",
    name: { mn: "Ус, ус зайлуулах", en: "Water and drainage" },
    icon: "droplets",
    subcategories: [
      sub("blocked_drain", "Бөглөрсөн шуудуу", "Blocked drain"),
      sub("flooded", "Усанд автсан гудамж", "Flooded street"),
      sub("drain_cover", "Эвдэрсэн шуудууны таг", "Broken drainage cover"),
      sub("leak", "Усны алдагдал", "Water leak"),
      sub("other", "Ус зайлуулалтын бусад асуудал", "Other drainage issue"),
    ],
  },
  {
    id: "infrastructure",
    name: { mn: "Нийтийн байгууламж", en: "Public infrastructure" },
    icon: "landmark",
    subcategories: [
      sub("bus_stop", "Эвдэрсэн автобусны буудал", "Damaged bus stop"),
      sub("bench", "Эвдэрсэн сандал", "Damaged public bench"),
      sub("traffic_sign", "Эвдэрсэн замын тэмдэг", "Damaged traffic sign"),
      sub("barrier", "Эвдэрсэн замын хашлага", "Damaged road barrier"),
      sub("facility", "Эвдэрсэн нийтийн байгууламж", "Damaged public facility"),
      sub("other", "Байгууламжийн бусад асуудал", "Other infrastructure issue"),
    ],
  },
  {
    id: "green",
    name: { mn: "Ногоон байгууламж", en: "Green spaces" },
    icon: "trees",
    subcategories: [
      sub("tree", "Гэмтсэн мод", "Damaged tree"),
      sub("fallen", "Унасан мод, мөчир", "Fallen tree or branch"),
      sub("landscaping", "Эвдэрсэн тохижилт", "Damaged public landscaping"),
      sub("park_equipment", "Аюултай тоглоомын талбай, тоног", "Unsafe park equipment"),
      sub("other", "Ногоон байгууламжийн бусад асуудал", "Other green-space issue"),
    ],
  },
  {
    id: "other",
    name: { mn: "Бусад", en: "Other" },
    icon: "ellipsis",
    subcategories: [
      sub("unlisted", "Ангилалд багтахгүй асуудал", "An issue that does not fit the available categories"),
      sub("unknown", "Тодорхойгүй асуудал", "Unknown or unclassified issue"),
    ],
  },
];

export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

export const PRIORITY_META: Record<Priority, { label: Bi; rank: number }> = {
  critical: { label: { mn: "Яаралтай", en: "Critical" }, rank: 4 },
  high: { label: { mn: "Өндөр", en: "High" }, rank: 3 },
  medium: { label: { mn: "Дунд", en: "Medium" }, rank: 2 },
  low: { label: { mn: "Бага", en: "Low" }, rank: 1 },
};

export const DISTRICT_ORDER: DistrictId[] = [
  "sukhbaatar",
  "chingeltei",
  "bayanzurkh",
  "khan_uul",
  "bayangol",
  "songinokhairkhan",
];

export const DISTRICT_META: Record<DistrictId, { label: Bi; center: LngLat }> = {
  sukhbaatar: { label: { mn: "Сүхбаатар", en: "Sükhbaatar" }, center: { lng: 106.925, lat: 47.93 } },
  chingeltei: { label: { mn: "Чингэлтэй", en: "Chingeltei" }, center: { lng: 106.9, lat: 47.945 } },
  bayanzurkh: { label: { mn: "Баянзүрх", en: "Bayanzürkh" }, center: { lng: 106.975, lat: 47.92 } },
  khan_uul: { label: { mn: "Хан-Уул", en: "Khan-Uul" }, center: { lng: 106.89, lat: 47.875 } },
  bayangol: { label: { mn: "Баянгол", en: "Bayangol" }, center: { lng: 106.865, lat: 47.91 } },
  songinokhairkhan: {
    label: { mn: "Сонгинохайрхан", en: "Songinokhairkhan" },
    center: { lng: 106.81, lat: 47.92 },
  },
};

export const FLAG_REASON_LABEL: Record<FlagReason, Bi> = {
  spam: { mn: "Спам эсвэл зар сурталчилгаа", en: "Spam or advertising" },
  offensive: { mn: "Доромжилсон агуулга", en: "Offensive content" },
  personal_info: { mn: "Хувийн мэдээлэл (царай, дугаар)", en: "Personal information (faces, plates)" },
  not_infrastructure: { mn: "Дэд бүтцийн асуудал биш", en: "Not an infrastructure problem" },
  other: { mn: "Бусад", en: "Other" },
};

export const ROLE_LABEL: Record<"citizen" | "admin" | "org_staff" | "org_manager", Bi> = {
  citizen: { mn: "Иргэн", en: "Citizen" },
  admin: { mn: "FixUB админ", en: "FixUB admin" },
  org_staff: { mn: "Байгууллагын ажилтан", en: "Organization staff" },
  org_manager: { mn: "Байгууллагын менежер", en: "Organization manager" },
};

/** Ulaanbaatar service area (approximate bounding box). */
export const SERVICE_AREA = { west: 106.6, south: 47.8, east: 107.25, north: 48.05 };
export const UB_CENTER: LngLat = { lng: 106.917, lat: 47.918 };

/**
 * The version of the notice a person accepts before their first report (what becomes public).
 * Change it when the text in the report form changes: everyone is then asked again.
 */
export const CONSENT_VERSION = "2026-11";

/**
 * How many days after the priority is set a report should be resolved. Past that, the consoles
 * mark it overdue. Targets for the staff, not a promise shown to citizens.
 */
export const RESPONSE_TARGET_DAYS: Record<"low" | "medium" | "high" | "critical", number> = { critical: 2, high: 7, medium: 14, low: 30 };

export const LIMITS = {
  descriptionMin: 10,
  descriptionMax: 1000,
  photosMax: 3,
  duplicateRadiusM: 50,
  duplicateDays: 90,
  /** The public list holds every open report, and resolved or closed ones for this many days. */
  publicHistoryDays: 90,
  autoHideFlags: 3,
  ageWarnDays: 14,
  ageDangerDays: 30,
} as const;
