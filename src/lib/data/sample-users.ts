// The sample users of a demonstration deployment (DEMO_LOGIN=true): who the login page offers
// and who the sample-login endpoint accepts. Kept apart from the sample reports (./seed.ts) so
// the server bundle carries these few lines and not the whole data set.
import type { User } from "../types";

export const DEMO_USERS: User[] = [
  { id: "u-citizen", name: "Бат", role: "citizen" },
  { id: "u-citizen-2", name: "Д. Номин", role: "citizen" },
  { id: "u-admin", name: "Х. Бадрах", role: "admin" },
  { id: "u-road-staff", name: "Г. Бат-Эрдэнэ", role: "org_staff", organizationId: "org-road", unitId: "unit-road-a" },
  { id: "u-road-mgr", name: "С. Оюунчимэг", role: "org_manager", organizationId: "org-road" },
  { id: "u-light-staff", name: "Э. Ганбаатар", role: "org_staff", organizationId: "org-light", unitId: "unit-light-1" },
  { id: "u-san-staff", name: "Ц. Мөнхзул", role: "org_staff", organizationId: "org-sanitation", unitId: "unit-san-north" },
  { id: "u-water-staff", name: "П. Ариунбат", role: "org_staff", organizationId: "org-water", unitId: "unit-water-1" },
];
