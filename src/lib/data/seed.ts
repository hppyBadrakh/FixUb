// Demo data. Organizations are fictional ("demo") and are not integrated with any government body.
import { DEFAULT_CATEGORIES, ROLE_LABEL } from "../meta";
import { makeRef, uid } from "../domain/rules";
import { DEMO_USERS } from "./sample-users";
import type {
  ActivityEvent,
  Bi,
  CategorySlug,
  ClosureReason,
  DemoState,
  DistrictId,
  FlagReason,
  Organization,
  Report,
  Priority,
  ReportStatus,
  TimelineEvent,
} from "../types";

export const DEMO_ORGANIZATIONS: Organization[] = [
  {
    id: "org-road",
    name: { mn: "Замын засвар үйлчилгээ (демо)", en: "Road Maintenance (demo)" },
    units: [
      { id: "unit-road-a", name: { mn: "Засварын бригад А", en: "Roads crew A" } },
      { id: "unit-road-b", name: { mn: "Засварын бригад Б", en: "Roads crew B" } },
    ],
    categories: ["roads", "sidewalks", "infrastructure"],
    isActive: true,
  },
  {
    id: "org-light",
    name: { mn: "Гудамжны гэрэлтүүлэг (демо)", en: "Street Lighting (demo)" },
    units: [{ id: "unit-light-1", name: { mn: "Гэрэлтүүлгийн баг", en: "Lighting team" } }],
    categories: ["lighting"],
    isActive: true,
  },
  {
    id: "org-sanitation",
    name: { mn: "Хог хаягдал, тохижилт (демо)", en: "Sanitation & Landscaping (demo)" },
    units: [
      { id: "unit-san-north", name: { mn: "Хойд бүсийн баг", en: "Sanitation North" } },
      { id: "unit-san-south", name: { mn: "Өмнөд бүсийн баг", en: "Sanitation South" } },
    ],
    categories: ["waste", "green"],
    isActive: true,
  },
  {
    id: "org-water",
    name: { mn: "Ус суваг, шуудуу (демо)", en: "Water & Drainage (demo)" },
    units: [{ id: "unit-water-1", name: { mn: "Шуудууны баг", en: "Drainage team" } }],
    categories: ["water"],
    isActive: true,
  },
];

type Step = [to: ReportStatus, afterHours: number, note?: string];

interface Spec {
  cat: CategorySlug;
  sub: string;
  /** Admin-assigned priority; `null` = still pending review. */
  prio: Priority | null;
  place: Bi;
  district: DistrictId;
  lat: number;
  lng: number;
  desc: Bi;
  ageH: number;
  org?: string;
  unit?: string;
  steps?: Step[];
  reporter?: string;
  conf?: number;
  feedback?: [fixed: number, notFixed: number];
  flags?: FlagReason[];
  closure?: ClosureReason;
  dupOf?: number;
  hidden?: boolean;
}

const D = 24;

const SPECS: Spec[] = [
  /* 0 */ {
    cat: "roads",
    sub: "pothole",
    prio: "high",
    place: { mn: "Энхтайваны өргөн чөлөө, 3-р сургуулийн ойролцоо", en: "Peace Avenue, near School No. 3" },
    district: "sukhbaatar",
    lat: 47.9184,
    lng: 106.9262,
    desc: {
      mn: "Баруун эгнээнд нэг метр орчим өргөн нүх бий. Бороо орсны дараа ус тогтдог тул машинууд автобусны эгнээ рүү огцом эргэж байна.",
      en: "About a metre wide in the right lane, fills with water after rain. Cars swerve into the bus lane to avoid it.",
    },
    ageH: 5 * D,
    org: "org-road",
    unit: "unit-road-a",
    steps: [["investigating", 27, "Пүрэв гарагийн өглөө бригад гэмтлийг хэмжинэ. Баруун эгнээ нарийсаж болзошгүй."]],
    conf: 6,
  },
  /* 1 */ {
    cat: "lighting",
    sub: "not_working",
    prio: null,
    place: { mn: "Сансарын туннелийн гарц", en: "Sansar tunnel exit" },
    district: "bayanzurkh",
    lat: 47.9262,
    lng: 106.9398,
    desc: {
      mn: "Туннелээс гарах хэсгийн гурван гэрэл хоёр долоо хоног асахгүй байна. Шөнө явган зорчигч харагдахгүй.",
      en: "Three lights at the tunnel exit have been out for two weeks. Pedestrians are invisible at night.",
    },
    ageH: 39 * D,
    conf: 24,
  },
  /* 2 */ {
    cat: "waste",
    sub: "dumping",
    prio: "medium",
    place: { mn: "Баянхошуу захын ар тал", en: "Behind Bayankhoshuu market" },
    district: "songinokhairkhan",
    lat: 47.9563,
    lng: 106.8414,
    desc: {
      mn: "Барилгын хог, шуудай хог явган хүний замыг хааж, хүүхдүүд зам дээгүүр явж байна.",
      en: "Construction waste and sacks of rubbish block the pavement; children walk on the road.",
    },
    ageH: 13 * D,
    org: "org-sanitation",
    unit: "unit-san-north",
    conf: 7,
  },
  /* 3 */ {
    cat: "water",
    sub: "flooded",
    prio: "high",
    place: { mn: "Нарны замын гарам", en: "Narny Road underpass" },
    district: "bayanzurkh",
    lat: 47.9118,
    lng: 106.9452,
    desc: {
      mn: "Шуудуу бөглөрч, борооны ус зам дээр халиж байна. Гарамд 20 см ус тогтсон.",
      en: "Ditch is blocked and rainwater overflows onto the road; 20 cm of water stands in the underpass.",
    },
    ageH: 3 * D,
    org: "org-water",
    unit: "unit-water-1",
    steps: [
      ["investigating", 4],
      ["in_progress", 30, "Шуудууг цэвэрлэх техник гарсан."],
    ],
    conf: 9,
  },
  /* 4 */ {
    cat: "sidewalks",
    sub: "crossing",
    prio: "medium",
    place: { mn: "13-р хороолол, 22-р байр", en: "13th micro-district, bldg 22" },
    district: "bayanzurkh",
    lat: 47.9208,
    lng: 106.9571,
    desc: {
      mn: "Гарцан дээрх налуу зам байхгүй, тэргэнцэртэй хүн гарч чадахгүй.",
      en: "Kerb ramp missing at the crossing; wheelchair users cannot cross.",
    },
    ageH: 33 * D,
    org: "org-road",
    unit: "unit-road-b",
    steps: [["investigating", 50]],
    reporter: "u-citizen",
    conf: 13,
  },
  /* 5 */ {
    cat: "roads",
    sub: "pothole",
    prio: "high",
    place: { mn: "Зайсангийн зам, 2-р км", en: "Zaisan road, km 2" },
    district: "khan_uul",
    lat: 47.8915,
    lng: 106.9163,
    desc: {
      mn: "Гүүрний өмнөх хэсэгт хэд хэдэн гүн нүх үүссэн, дугуй хагарах эрсдэлтэй.",
      en: "Several deep holes before the bridge; risk of burst tyres.",
    },
    ageH: 6 * D,
    org: "org-road",
    unit: "unit-road-a",
    steps: [
      ["investigating", 20],
      ["in_progress", 70, "Асфальтан нөхөөсийг энэ долоо хоногт хийнэ."],
    ],
    conf: 14,
  },
  /* 6 */ {
    cat: "infrastructure",
    sub: "traffic_sign",
    prio: "medium",
    place: { mn: "Сөүлийн гудамжны уулзвар", en: "Seoul Street crossing" },
    district: "chingeltei",
    lat: 47.9142,
    lng: 106.9086,
    desc: {
      mn: "Явган хүний ногоон гэрэл хэтэрхий богино, ахмад хүмүүс амжиж гарахгүй байна.",
      en: "Pedestrian green phase is too short; older people can't finish crossing.",
    },
    ageH: 33 * D,
    org: "org-road",
    conf: 21,
  },
  /* 7 */ {
    cat: "waste",
    sub: "uncollected",
    prio: "medium",
    place: { mn: "Их тойруу, зүүн тал", en: "Ikh Toiruu, east side" },
    district: "chingeltei",
    lat: 47.9233,
    lng: 106.9128,
    desc: {
      mn: "Хогийн савнууд гурав хоног ачигдаагүй, хог салхинд тарж байна.",
      en: "Bins haven't been collected for three days and rubbish is blowing around.",
    },
    ageH: 6 * D,
    org: "org-sanitation",
    unit: "unit-san-north",
    steps: [
      ["in_progress", 10],
      ["resolved", 5 * D, "Савнуудыг ачиж, орчныг цэвэрлэсэн. Ачилтын хуваарийг өдөр бүр болгосон."],
    ],
    reporter: "u-citizen",
    conf: 14,
    feedback: [4, 1],
  },
  /* 8 */ {
    cat: "lighting",
    sub: "broken",
    prio: "medium",
    place: { mn: "Их тойруу, Багшийн их сургуулийн урд", en: "Ikh Toiruu, outside the University of Education" },
    district: "sukhbaatar",
    lat: 47.9221,
    lng: 106.9196,
    desc: {
      mn: "Гудамжны гэрэл анивчиж, шөнийн 22 цагаас хойш бүрэн унтардаг.",
      en: "Streetlight flickers and goes completely dark after 22:00.",
    },
    ageH: 9 * D,
    org: "org-light",
    unit: "unit-light-1",
    steps: [
      ["investigating", 12],
      ["resolved", 7 * D, "Гэрлийн чийдэн, тэжээлийн хайрцгийг сольсон."],
    ],
    conf: 5,
    feedback: [2, 3],
  },
  /* 9 */ {
    cat: "water",
    sub: "drain_cover",
    prio: "critical",
    place: { mn: "Толгойтын тойрог", en: "Tolgoit roundabout" },
    district: "songinokhairkhan",
    lat: 47.9152,
    lng: 106.8385,
    desc: {
      mn: "Худгийн таг алга болсон, шөнө маш аюултай.",
      en: "Drain cover is missing — very dangerous at night.",
    },
    ageH: 1 * D,
    org: "org-water",
    unit: "unit-water-1",
    steps: [["in_progress", 3, "Түр хашаа барьсан, шинэ таг захиалсан."]],
    conf: 22,
  },
  /* 10 */ {
    cat: "roads",
    sub: "pothole",
    prio: null,
    place: { mn: "Чингисийн өргөн чөлөө, Шангри-Ла орчим", en: "Chinggis Avenue, near Shangri-La" },
    district: "sukhbaatar",
    lat: 47.9133,
    lng: 106.9218,
    desc: {
      mn: "Зүүн эгнээний хучилт суусан, автобус орох үед ус цацагдаж байна.",
      en: "Left lane surface has sunk; buses splash pedestrians.",
    },
    ageH: 15,
    conf: 2,
  },
  /* 11 */ {
    cat: "sidewalks",
    sub: "uneven",
    prio: null,
    place: { mn: "Дүнжингарав худалдааны төвийн гарц", en: "Dunjingarav mall crossing" },
    district: "bayangol",
    lat: 47.9043,
    lng: 106.8722,
    desc: {
      mn: "Явган замын хавтангууд хөдөлж, хэд хэдэн хүн бүдэрч унасан.",
      en: "Paving slabs are loose; several people have tripped.",
    },
    ageH: 4 * D,
    reporter: "u-citizen",
    conf: 3,
  },
  /* 12 */ {
    cat: "waste",
    sub: "dumping",
    prio: "low",
    place: { mn: "Барс захын ойролцоо", en: "Near Bars market" },
    district: "bayangol",
    lat: 47.9209,
    lng: 106.8781,
    desc: {
      mn: "Гаражуудын ард хууль бусаар хог асгадаг болсон.",
      en: "Illegal dumping behind the garages.",
    },
    ageH: 37 * D,
    org: "org-sanitation",
    unit: "unit-san-south",
    steps: [["investigating", 6 * D]],
    conf: 2,
  },
  /* 13 */ {
    cat: "lighting",
    sub: "not_working",
    prio: "high",
    place: { mn: "Яармагийн зам", en: "Yarmag road" },
    district: "khan_uul",
    lat: 47.8663,
    lng: 106.8318,
    desc: {
      mn: "500 метр орчим хэсэгт гэрэл огт асахгүй, автобусны буудал харанхуй.",
      en: "About 500 m of road is completely dark, including the bus stop.",
    },
    ageH: 8 * D,
    org: "org-light",
    unit: "unit-light-1",
    steps: [
      ["investigating", 20],
      ["in_progress", 3 * D, "Кабелийн гэмтлийг хайж байна."],
    ],
    conf: 11,
  },
  /* 14 */ {
    cat: "roads",
    sub: "pothole",
    prio: null,
    place: { mn: "Нисэхийн зам, Хүннү Молл орчим", en: "Airport road, near Hunnu Mall" },
    district: "khan_uul",
    lat: 47.8762,
    lng: 106.8402,
    desc: {
      mn: "Хоёр эгнээнд дараалсан нүхнүүд, машинууд урсгал руу орж тойрч байна.",
      en: "A row of holes across two lanes; cars swerve into oncoming traffic.",
    },
    ageH: 2 * D,
    conf: 4,
  },
  /* 15 */ {
    cat: "water",
    sub: "flooded",
    prio: null,
    place: { mn: "Гандан хийдийн зүүн хаалга", en: "Gandan monastery, east gate" },
    district: "chingeltei",
    lat: 47.9218,
    lng: 106.8969,
    desc: {
      mn: "Борооны ус гудамжаар урсаж, явган хүний зам шавар болжээ.",
      en: "Rainwater runs down the street and the pavement has turned to mud.",
    },
    ageH: 10,
  },
  /* 16 */ {
    cat: "infrastructure",
    sub: "bench",
    prio: "low",
    place: { mn: "Сүхбаатарын талбайн хойд тал", en: "North side of Sükhbaatar Square" },
    district: "sukhbaatar",
    lat: 47.9207,
    lng: 106.9175,
    desc: {
      mn: "Сандал эвдэрсэн байна.",
      en: "A bench is broken.",
    },
    ageH: 20 * D,
    org: "org-road",
    steps: [["closed", 2 * D, "Талбайн тохижилт нийслэлийн өөр байгууллагад хамаарна."]],
    closure: "out_of_scope",
  },
  /* 17 */ {
    cat: "infrastructure",
    sub: "traffic_sign",
    prio: "high",
    place: { mn: "Ард Аюушийн өргөн чөлөө", en: "Ard Ayush Avenue" },
    district: "songinokhairkhan",
    lat: 47.9195,
    lng: 106.8573,
    desc: {
      mn: "Хурдны хязгаарын тэмдэг унаж, зам дээр хэвтэж байна.",
      en: "A speed-limit sign has fallen and is lying in the road.",
    },
    ageH: 4 * D,
    org: "org-road",
    unit: "unit-road-b",
    steps: [["investigating", 30]],
    conf: 3,
  },
  /* 18 */ {
    cat: "waste",
    sub: "overflowing",
    prio: null,
    place: { mn: "Баянзүрхийн товчоо", en: "Bayanzürkh tovchoo" },
    district: "bayanzurkh",
    lat: 47.9228,
    lng: 106.9893,
    desc: {
      mn: "Автобусны буудлын хогийн сав дүүрч, хог газар хаягдаж байна.",
      en: "The bus-stop bin is overflowing and rubbish is on the ground.",
    },
    ageH: 3,
    conf: 1,
  },
  /* 19 */ {
    cat: "roads",
    sub: "cracked",
    prio: "medium",
    place: { mn: "Энхтайваны өргөн чөлөө × Их тойруу", en: "Peace Ave × Ikh Toiruu" },
    district: "sukhbaatar",
    lat: 47.9187,
    lng: 106.9266,
    desc: {
      mn: "Уулзварын өмнө хучилт хагарч, нүх томорч байна.",
      en: "Asphalt is cracking before the junction and the hole is growing.",
    },
    ageH: 7 * D,
    org: "org-road",
    conf: 2,
  },
  /* 20 */ {
    cat: "roads",
    sub: "pothole",
    prio: "medium",
    place: { mn: "Энхтайваны өргөн чөлөө, 3-р сургууль", en: "Peace Avenue, School No. 3" },
    district: "sukhbaatar",
    lat: 47.9183,
    lng: 106.9259,
    desc: {
      mn: "Сургуулийн урд том нүх байна.",
      en: "Big hole in front of the school.",
    },
    ageH: 4 * D,
    org: "org-road",
    steps: [["closed", 20]],
    closure: "duplicate",
    dupOf: 0,
    reporter: "u-citizen",
  },
  /* 21 */ {
    cat: "sidewalks",
    sub: "uneven",
    prio: "low",
    place: { mn: "Төв шуудангийн урд", en: "In front of the Central Post Office" },
    district: "sukhbaatar",
    lat: 47.9176,
    lng: 106.9128,
    desc: {
      mn: "Явган замын хавтан хагарч, хөшиж нүх гарсан.",
      en: "Paving slabs cracked and left a hole.",
    },
    ageH: 18 * D,
    org: "org-road",
    unit: "unit-road-b",
    steps: [
      ["in_progress", 2 * D],
      ["resolved", 9 * D, "Хавтанг сольж, ирмэгийг тэгшилсэн."],
    ],
    conf: 8,
    feedback: [6, 0],
  },
  /* 22 */ {
    cat: "lighting",
    sub: "not_working",
    prio: "medium",
    place: { mn: "Буянт-Ухаа 2 хороолол", en: "Buyant-Ukhaa 2 micro-district" },
    district: "khan_uul",
    lat: 47.8563,
    lng: 106.7894,
    desc: {
      mn: "Хашаан доторх гэрэл ажиллахгүй, хүүхдийн тоглоомын талбай харанхуй.",
      en: "Courtyard lights don't work and the playground is dark.",
    },
    ageH: 28 * D,
    org: "org-light",
    conf: 6,
  },
  /* 23 */ {
    cat: "water",
    sub: "blocked_drain",
    prio: "high",
    place: { mn: "Сэлбэ голын гүүр", en: "Selbe river bridge" },
    district: "chingeltei",
    lat: 47.9364,
    lng: 106.9227,
    desc: {
      mn: "Гүүрний доор хог бөглөрч, голын ус хальж болзошгүй.",
      en: "Rubbish is blocking the channel under the bridge; the river could overflow.",
    },
    ageH: 32 * D,
    org: "org-water",
    unit: "unit-water-1",
    steps: [["investigating", 3 * D]],
    conf: 11,
  },
  /* 24 */ {
    cat: "waste",
    sub: "uncollected",
    prio: "medium",
    place: { mn: "Дэнжийн мянга", en: "Denjiin Myanga" },
    district: "sukhbaatar",
    lat: 47.9311,
    lng: 106.9276,
    desc: {
      mn: "Гэр хорооллын хогийн цэг дүүрч, гудамжинд асгарсан.",
      en: "The ger-district collection point is full and spilling into the street.",
    },
    ageH: 28 * D,
    org: "org-sanitation",
    unit: "unit-san-north",
    steps: [
      ["investigating", 2 * D],
      ["in_progress", 4 * D],
    ],
    conf: 0,
  },
  /* 25 */ {
    cat: "infrastructure",
    sub: "traffic_sign",
    prio: "high",
    place: { mn: "120 мянгатын уулзвар", en: "120 Myangat junction" },
    district: "bayanzurkh",
    lat: 47.9165,
    lng: 106.9512,
    desc: {
      mn: "Гэрлэн дохио шар өнгөөр анивчсан хэвээр, уулзвар эмх замбараагүй.",
      en: "Traffic signal stuck on flashing amber; the junction is chaotic.",
    },
    ageH: 12 * D,
    org: "org-road",
    unit: "unit-road-a",
    steps: [
      ["in_progress", 5],
      ["resolved", 2 * D, "Удирдлагын блокийг сольж, дохиог хэвийн горимд оруулсан."],
    ],
    conf: 17,
    feedback: [9, 1],
  },
  /* 26 */ {
    cat: "roads",
    sub: "pothole",
    prio: "medium",
    place: { mn: "Офицеруудын ордны тойрог", en: "Officers' Palace roundabout" },
    district: "bayanzurkh",
    lat: 47.9145,
    lng: 106.9563,
    desc: {
      mn: "Тойргийн гадна эгнээнд хурц ирмэгтэй нүх.",
      en: "Sharp-edged hole in the outer lane of the roundabout.",
    },
    ageH: 16 * D,
    org: "org-road",
    unit: "unit-road-a",
    steps: [["investigating", 3 * D]],
    conf: 10,
  },
  /* 27 */ {
    cat: "other",
    sub: "unlisted",
    prio: null,
    place: { mn: "3-р хороолол", en: "3rd micro-district" },
    district: "bayangol",
    lat: 47.9142,
    lng: 106.8873,
    desc: {
      mn: "Хямд үнээр байр зарна, утсаар холбогдоно уу 9911xxxx.",
      en: "Apartment for sale cheap, call 9911xxxx.",
    },
    ageH: 2 * D,
    flags: ["spam", "spam", "not_infrastructure"],
    hidden: true,
  },
  /* 28 */ {
    cat: "infrastructure",
    sub: "barrier",
    prio: null,
    place: { mn: "Улсын их дэлгүүрийн урд", en: "In front of the State Department Store" },
    district: "chingeltei",
    lat: 47.9164,
    lng: 106.9046,
    desc: {
      mn: "Явган замын хашлага эвдэрч, төмөр ирмэг цухуйсан. Зураг дээр хажуугийн хүмүүсийн царай харагдаж байна.",
      en: "Railing is broken and a metal edge sticks out. Faces of passers-by are visible in the photo.",
    },
    ageH: 1 * D,
    flags: ["personal_info"],
    conf: 1,
  },
  /* 29 */ {
    cat: "lighting",
    sub: "not_working",
    prio: null,
    place: { mn: "Хорооллын 1-р гудамж, Шар хадны ойролцоо", en: "Near Shar Khad, 1st street" },
    district: "bayanzurkh",
    lat: 47.9301,
    lng: 106.9705,
    desc: {
      mn: "Гудамжны ганц гэрэл шатсан, оройн цагаар хүүхдүүд сургуулиасаа харанхуйд ирдэг.",
      en: "The street's only light burnt out; children walk home from school in the dark.",
    },
    ageH: 30,
    conf: 3,
  },
  /* 30 */ {
    cat: "green",
    sub: "fallen",
    prio: null,
    place: { mn: "Үндэсний цэцэрлэгт хүрээлэнгийн хойд хаалга", en: "National Garden Park, north gate" },
    district: "bayanzurkh",
    lat: 47.9028,
    lng: 106.9516,
    desc: {
      mn: "Салхинд том мөчир хугарч, явган замыг хааж унасан. Хүүхдүүд дээгүүр нь гарч байна.",
      en: "A large branch broke off in the wind and is blocking the footpath. Children are climbing over it.",
    },
    ageH: 6,
    conf: 2,
  },
  /* 31 */ {
    cat: "lighting",
    sub: "wiring",
    prio: "critical",
    place: { mn: "Их тойруу, Монгол улсын их сургуулийн хойд тал", en: "Ikh Toiruu, behind the National University" },
    district: "sukhbaatar",
    lat: 47.9229,
    lng: 106.9213,
    desc: {
      mn: "Гэрлийн шонгийн ёроолын таг алга болж, цахилгааны утас ил гарсан. Оюутнууд хажуугаар нь өдөр бүр явдаг.",
      en: "The access cover at the base of a light pole is missing and live wiring is exposed. Students walk past every day.",
    },
    ageH: 20,
    org: "org-light",
    unit: "unit-light-1",
    steps: [["investigating", 2, "Шонг түр хашиж, цахилгааныг салгасан. Тагийг солино."]],
    conf: 8,
  },
];

const SEED_CONFIRMERS = Array.from({ length: 30 }, (_, i) => `seed-u${i}`);

function staffLabel(orgId: string | undefined): Bi {
  return DEMO_ORGANIZATIONS.find((o) => o.id === orgId)?.name ?? { mn: "FixUB баг", en: "FixUB team" };
}

export function buildSeedState(now: number): DemoState {
  const reports: Report[] = [];
  const activity: ActivityEvent[] = [];
  let seq = 4100;

  SPECS.forEach((s, i) => {
    seq += 1;
    const id = `seed-${i}`;
    const created = now - s.ageH * 36e5;
    const timeline: TimelineEvent[] = [
      { id: uid("t"), type: "status", from: null, to: "reported", at: created, actorKind: "citizen", actorLabel: ROLE_LABEL.citizen },
    ];
    activity.push({ id: uid("a"), at: created, reportId: id, type: "created" });
    if (s.org) {
      const at = created + Math.min(2, s.ageH / 4) * 36e5;
      timeline.push({
        id: uid("t"),
        type: "assigned",
        at,
        organizationId: s.org,
        unitId: s.unit,
        actorKind: "admin",
        actorLabel: { mn: "FixUB баг", en: "FixUB team" },
      });
      activity.push({ id: uid("a"), at, reportId: id, type: "assigned", organizationId: s.org });
    }
    let status: ReportStatus = "reported";
    let statusChangedAt = created;
    for (const [to, after, note] of s.steps ?? []) {
      const at = Math.min(created + after * 36e5, now - 60e3);
      const actorKind = to === "closed" ? "org_manager" : "org_staff";
      timeline.push({
        id: uid("t"),
        type: "status",
        from: status,
        to,
        at,
        actorKind,
        actorLabel: staffLabel(s.org),
        note,
        reason: to === "closed" ? s.closure : undefined,
      });
      activity.push({ id: uid("a"), at, reportId: id, type: "status", to, reason: to === "closed" ? s.closure : undefined, actorLabel: staffLabel(s.org) });
      status = to;
      statusChangedAt = at;
    }
    const [fixed, notFixed] = s.feedback ?? [0, 0];
    const feedback = [
      ...Array.from({ length: fixed }, (_, k) => ({ userId: SEED_CONFIRMERS[k], verdict: "fixed" as const })),
      ...Array.from({ length: notFixed }, (_, k) => ({ userId: SEED_CONFIRMERS[29 - k], verdict: "not_fixed" as const })),
    ];
    const flags = (s.flags ?? []).map((reason, k) => ({
      id: uid("f"),
      userId: SEED_CONFIRMERS[k + 10],
      reason,
      at: created + (k + 1) * 36e5,
      status: "open" as const,
    }));
    reports.push({
      id,
      ref: makeRef(seq, now),
      category: s.cat,
      subcategory: s.sub,
      priority: s.prio,
      priorityDecision: s.prio
        ? { by: DEMO_USERS.find((u) => u.role === "admin")!.name, at: created + Math.min(1.5, s.ageH / 3) * 36e5, note: s.prio === "critical" ? "Аюулгүй байдалд шууд эрсдэлтэй." : undefined }
        : undefined,
      description: s.desc.mn,
      descriptionEn: s.desc.en,
      addressHint: s.place.mn,
      addressHintEn: s.place.en,
      district: s.district,
      lng: s.lng,
      lat: s.lat,
      status,
      closureReason: status === "closed" ? s.closure : undefined,
      duplicateOfId: s.dupOf !== undefined ? `seed-${s.dupOf}` : undefined,
      visibility: s.hidden ? "hidden" : "visible",
      organizationId: s.org,
      unitId: s.unit,
      reporterId: s.reporter ?? `seed-reporter-${i}`,
      photoIds: [],
      confirmations: SEED_CONFIRMERS.slice(0, s.conf ?? 0),
      feedback,
      flags,
      createdAt: created,
      updatedAt: statusChangedAt,
      statusChangedAt,
      version: timeline.length,
      timeline,
    });
  });

  activity.sort((a, b) => b.at - a.at);
  return {
    schema: 2,
    seededAt: now,
    seq,
    reports,
    organizations: DEMO_ORGANIZATIONS,
    categories: DEFAULT_CATEGORIES,
    users: DEMO_USERS,
    activity,
  };
}
