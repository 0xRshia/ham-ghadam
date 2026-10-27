import { AppLink } from "@/components/event/app-navigation";
import styles from "./legal.module.css";

type Block = { text: string; rows?: never } | { rows: string[][]; text?: never };
export function LegalDocument({ title, blocks, version }: { title: string; blocks: readonly Block[]; version: string }) {
  return <main className={styles.document} dir="rtl">
    <nav aria-label="پیوندهای مقررات"><AppLink href="/">هم‌قدم</AppLink><AppLink href="/privacy">حریم خصوصی</AppLink></nav>
    <h1>{title}</h1><p className={styles.note}>نسخه <bdi dir="ltr">{version}</bdi></p>
    <article>{blocks.filter((block,index) => index !== 0 || block.text !== title).map((block, index) => block.rows ? <div className={styles.tableScroll} key={index}><table><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => r === 0 ? <th scope="col" key={c}>{cell}</th> : <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div> : /^(ماده |پیوست شماره)/.test(block.text) ? <h2 key={index}>{block.text}</h2> : <p key={index}>{block.text}</p>)}</article>
    <AppLink href="/contact">تماس با هم‌قدم</AppLink>
  </main>;
}
