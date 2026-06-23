import { LexiconExplorer } from "@/components/lexicon-explorer";
import { getLetDoveItems } from "@/lib/letdove";

export const metadata = {
  title: "letdove knowledge base",
  description: "Browse LetDove structured content cards by title, code, and description."
};

export default function LexiconPage() {
  const items = getLetDoveItems();

  return (
    <LexiconExplorer items={items} />
  );
}
