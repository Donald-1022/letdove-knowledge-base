import { LexiconExplorer } from "@/components/lexicon-explorer";
import { getLetDoveItems } from "@/lib/letdove";

export const metadata = {
  title: "letdove knowledge base",
  description: "A shared reference library built for quick lookup across L1/L2 categories and LetDove code."
};

export default function LibraryPage() {
  const items = getLetDoveItems();

  return (
    <LexiconExplorer items={items} />
  );
}
