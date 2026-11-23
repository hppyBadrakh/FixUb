"use client";

// The privacy and terms pages. The privacy text describes what the software stores and shows
// (keep it in step with src/db/schema.ts and src/server/queries/reports.ts when those change).
// Both are drafts until a lawyer has reviewed them: see src/lib/operator.ts.
import Link from "next/link";
import { Banner } from "@/components/ui/feedback";
import { useT } from "@/lib/i18n";
import { LIMITS } from "@/lib/meta";
import { legalTextsAreFinal, OPERATOR } from "@/lib/operator";
import { useStore } from "@/lib/store";

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-title-1 font-[650] tracking-tight">{title}</h1>
      <p className="mt-1 text-small text-ink-subtle">
        {t("Сүүлд шинэчилсэн:", "Last updated:")} {OPERATOR.updated}
      </p>
      {!legalTextsAreFinal() && (
        <Banner tone="warning" className="mt-5" title={t("Төсөл хувилбар", "Draft")}>
          {t(
            "Энэ бичвэрийг систем юу хадгалж, юу харуулдгаас нь үндэслэн бичсэн. Хуульч хянаагүй бөгөөд үйлчилгээ эрхлэгчийг хараахан нэрлээгүй байна.",
            "This text was written from what the system stores and shows. It has not been reviewed by a lawyer, and the operator of the service has not been named yet.",
          )}
        </Banner>
      )}
      <div className="mt-6 space-y-8">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-title-3 font-[650]">{title}</h2>
      <div className="mt-2 space-y-2 text-body text-ink-muted [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

function Operator() {
  const { t } = useT();
  return <>{OPERATOR.name || t("(үйлчилгээ эрхлэгчийг эхлэхээс өмнө нэрлэнэ)", "(the operator will be named before launch)")}</>;
}

function Contact() {
  const { t } = useT();
  return OPERATOR.contactEmail ? (
    <a className="font-[600] text-brand underline" href={`mailto:${OPERATOR.contactEmail}`}>
      {OPERATOR.contactEmail}
    </a>
  ) : (
    <>{t("(холбоо барих хаягийг эхлэхээс өмнө нийтэлнэ)", "(a contact address will be published before launch)")}</>
  );
}

export function PrivacyPage() {
  const { t } = useT();
  const { server } = useStore();
  return (
    <Page title={t("Нууцлалын бодлого", "Privacy")}>
      <Section title={t("Хэн хариуцах вэ", "Who is responsible")}>
        <p>
          {t("FixUB-ийг эрхлэн явуулж, энд байгаа хувийн мэдээллийг хариуцагч: ", "FixUB is run by, and the personal data in it is the responsibility of: ")}
          <Operator />. {t("Асуулт, хүсэлтээ илгээх хаяг: ", "Questions and requests go to: ")}
          <Contact />.
        </p>
      </Section>

      <Section title={t("Таны тухай юу хадгалдаг вэ", "What we keep about you")}>
        <ul>
          <li>{t("Google-ээр нэвтрэхэд: таны нэр, имэйл хаяг, профайл зургийн холбоос. Нууц үгийг бид хэзээ ч авдаггүй.", "When you sign in with Google: your name, email address and the link to your profile picture. We never receive your password.")}</li>
          <li>{t("Нэвтэрсэн үед: таны IP хаяг болон хөтчийн төрөл (аюулгүй байдлын үүднээс).", "While you are signed in: your IP address and browser type, for security.")}</li>
          <li>{t("Таны илгээсэн мэдээлэл: зураг, газрын зураг дээрх цэг, ангилал, тайлбар, цаг хугацаа.", "The reports you file: photos, the point on the map, category, description and time.")}</li>
          <li>{t("Таны “Надад ч бас”, “зассан / засаагүй” хариулт, зохисгүй агуулгын мэдэгдэл.", "Your “me too”, your “fixed / still broken” answers, and the reports you flag.")}</li>
          <li>{t("Таны мэдээллийн явцын тухай мэдэгдлүүд.", "Notifications about the progress of your reports.")}</li>
        </ul>
        <p>
          {t(
            "Камераар авсан зургийг илгээхээс өмнө таны төхөөрөмж дээр дахин кодчилдог тул зургийн доторх байршил (GPS) болон төхөөрөмжийн мэдээлэл хадгалагдахгүй.",
            "A photo is re-encoded on your device before it is sent, so the location (GPS) and device details inside the image file are not kept.",
          )}
        </p>
      </Section>

      <Section title={t("Хэн юу хардаг вэ", "Who sees what")}>
        <ul>
          <li>
            {server.reviewBeforePublic
              ? t("Мэдээлэл (зураг, байршил, ангилал, тайлбар, явц) FixUB баг хянасны дараа хэн бүхэнд нээлттэй.", "A report (photos, location, category, description, progress) is public to everyone once the FixUB team has reviewed it.")
              : t("Мэдээлэл (зураг, байршил, ангилал, тайлбар, явц) илгээмэгц хэн бүхэнд нээлттэй.", "A report (photos, location, category, description, progress) is public to everyone as soon as it is sent.")}
          </li>
          <li>{t("Хэн мэдээлснийг хэзээ ч харуулахгүй: олон нийтэд ч, мэдээллийг хариуцах байгууллагын ажилтанд ч.", "Who filed a report is never shown: not to the public, and not to the staff of the organization that handles it.")}</li>
          <li>{t("“Надад ч бас” болон “зассан / засаагүй” хариулт зөвхөн тоогоор харагдана.", "“Me too” and “fixed / still broken” answers are shown only as counts.")}</li>
          <li>{t("FixUB-ийн админ таны нэр, имэйл, эрхийг хэрэглэгчийн жагсаалтаас харна. Мэдээллийг бүртгэлтэй холбож харах боломж зөвхөн өгөгдлийн сангийн администраторт бий бөгөөд зөрчил шалгах үед л ашиглана.", "FixUB admins see your name, email and access in the list of users. Only the administrators of the database can link a report to an account, and that is done only to look into abuse.")}</li>
        </ul>
      </Section>

      <Section title={t("Хаана хадгалдаг, хэн боловсруулдаг вэ", "Where it is kept, and who processes it")}>
        <ul>
          <li>{t("Өгөгдлийн сан: Neon (Сингапур дахь сервер).", "Database: Neon (servers in Singapore).")}</li>
          <li>{t("Вэб сайт ба зураг: Cloudflare.", "The site and photos: Cloudflare.")}</li>
          <li>{t("Нэвтрэлт: Google.", "Sign-in: Google.")}</li>
          <li>{t("Газрын зураг: OpenFreeMap (OpenStreetMap). Газрын зураг ачаалахад таны хөтөч тэдний сервертэй шууд холбогдоно.", "Map: OpenFreeMap (OpenStreetMap). Your browser contacts their servers directly to load the map.")}</li>
        </ul>
        <p>{t("Зар сурталчилгаа, хэрэглэгчийг мөрдөх хэрэгсэл ашигладаггүй. Cookie нь зөвхөн таныг нэвтэрсэн хэвээр байлгахад хэрэглэгдэнэ; хэл, өнгөний сонголт таны хөтчид хадгалагдана.", "There is no advertising and no tracking. The only cookie keeps you signed in; your language and theme are remembered in your browser.")}</p>
      </Section>

      <Section title={t("Хэр удаан хадгалдаг вэ", "How long we keep it")}>
        <p>
          {t(
            "Бүртгэлийг таныг устгуулах хүсэлт гаргах хүртэл хадгална. Бүртгэлээ устгуулахад таны нэр, имэйл, нэвтрэлтийн мэдээлэл, “Надад ч бас”, хариултууд, мэдэгдлүүд устана. Таны илгээсэн мэдээллүүд нийтийн бүртгэл болж үлдэх боловч тантай холбогдохоо болино.",
            "Your account is kept until you ask for it to be deleted. Deleting it removes your name, email, sign-in details, “me too”, answers and notifications. The reports you filed stay as a public record, but are no longer linked to you.",
          )}
        </p>
      </Section>

      <Section title={t("Таны эрх", "Your rights")}>
        <p>
          {t(
            "Та өөрийн мэдээллийг авах, засуулах, устгуулах, мөн тодорхой мэдээллийг нийтээс нуулгах хүсэлт гаргаж болно. Хүсэлтээ дээрх хаягаар илгээнэ үү.",
            "You can ask for a copy of your data, to have it corrected or deleted, and to have a particular report hidden from the public. Send the request to the address above.",
          )}
        </p>
        <p>
          <Link className="font-[600] text-brand underline" href="/terms">
            {t("Үйлчилгээний нөхцөл", "Terms of use")}
          </Link>
        </p>
      </Section>
    </Page>
  );
}

export function TermsPage() {
  const { t } = useT();
  return (
    <Page title={t("Үйлчилгээний нөхцөл", "Terms of use")}>
      <Section title={t("FixUB гэж юу вэ", "What FixUB is")}>
        <p>
          {t(
            "FixUB нь Улаанбаатарын нийтийн дэд бүтцийн асуудлыг (зам, гэрэлтүүлэг, хог, ус гэх мэт) мэдээлж, шийдвэрлэлтийн явцыг нийтэд ил харуулах үйлчилгээ. Эрхлэгч: ",
            "FixUB is a service for reporting problems with public infrastructure in Ulaanbaatar (roads, lighting, waste, water and the like) and showing their progress in public. It is run by: ",
          )}
          <Operator />.
        </p>
        <p className="font-[600] text-ink">
          {t("FixUB яаралтай тусламжийн үйлчилгээ биш. Аюултай үед 102, 103, 105 руу залгана уу.", "FixUB is not an emergency service. In danger, call 102, 103 or 105.")}
        </p>
      </Section>

      <Section title={t("Мэдээлэхдээ", "When you report")}>
        <ul>
          <li>{t("Нийтийн эзэмшлийн газарт байгаа бодит асуудлыг, тэр газар дээр нь авсан зургаар мэдээлнэ.", "Report real problems in public places, with a photo taken on the spot.")}</li>
          <li>{t("Хүний нүүр, машины дугаар, хувийн мэдээллийг зураг болон тайлбарт оруулахгүй байхыг хичээнэ.", "Keep people's faces, number plates and personal details out of photos and descriptions.")}</li>
          <li>{t("Доромжлол, зар сурталчилгаа, худал мэдээлэл оруулахгүй.", "No insults, advertising or false reports.")}</li>
          <li>{t(`Нэг мэдээлэлд ${LIMITS.photosMax} хүртэл зураг, цагт хязгаартай тооны мэдээлэл илгээнэ.`, `Up to ${LIMITS.photosMax} photos per report, and a limited number of reports per hour.`)}</li>
        </ul>
      </Section>

      <Section title={t("Таны оруулсан зүйл", "What you post")}>
        <p>
          {t(
            "Та илгээсэн зураг, тайлбараа FixUB-д нийтлэх, хариуцах байгууллагад дамжуулахыг зөвшөөрнө. Тэдгээр нь таны нэргүйгээр нийтэд харагдана.",
            "You allow FixUB to publish the photos and descriptions you send and to pass them to the organization responsible. They are shown publicly without your name.",
          )}
        </p>
      </Section>

      <Section title={t("Хяналт", "Moderation")}>
        <p>
          {t(
            `Хэн ч зохисгүй мэдээллийг мэдэгдэж болно. ${LIMITS.autoHideFlags} хүн мэдэгдвэл хянагч шалгах хүртэл түр нуугдана. Хянагч дүрэм зөрчсөн мэдээллийг нууж, давтан зөрчсөн бүртгэлийг хааж болно.`,
            `Anyone can flag a report. After ${LIMITS.autoHideFlags} flags it is hidden until a moderator has looked at it. Moderators may hide reports that break these rules and block accounts that keep breaking them.`,
          )}
        </p>
      </Section>

      <Section title={t("Юуг амлахгүй вэ", "What is not promised")}>
        <p>
          {t(
            "FixUB мэдээллийг хүлээн авч, ангилж, хариуцах байгууллагад хуваарилж, явцыг нийтэлнэ. Асуудлыг засах эсэх, хэзээ засахыг тухайн байгууллага шийднэ: FixUB үүнийг баталгаажуулж чадахгүй.",
            "FixUB receives reports, sorts them, assigns them to the organization responsible and publishes their progress. Whether and when a problem is fixed is decided by that organization: FixUB cannot guarantee it.",
          )}
        </p>
      </Section>

      <Section title={t("Өөрчлөлт", "Changes")}>
        <p>
          {t(
            "Эдгээр нөхцөл өөрчлөгдвөл огноог шинэчилж, мэдээлэхээс өмнө шинэ нөхцөлийг танд дахин үзүүлнэ.",
            "When these terms change, the date above changes and you are shown the new notice before your next report.",
          )}
        </p>
        <p>
          <Link className="font-[600] text-brand underline" href="/privacy">
            {t("Нууцлалын бодлого", "Privacy")}
          </Link>
        </p>
      </Section>
    </Page>
  );
}

/** Links to both pages, for the foot of public pages and the notice before a first report. */
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <p className={className}>
      <Link className="underline hover:text-ink" href="/privacy">
        {t("Нууцлалын бодлого", "Privacy")}
      </Link>
      <span className="mx-2">·</span>
      <Link className="underline hover:text-ink" href="/terms">
        {t("Үйлчилгээний нөхцөл", "Terms of use")}
      </Link>
    </p>
  );
}
