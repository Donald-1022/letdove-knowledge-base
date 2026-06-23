import { LexiconExplorer } from "@/components/lexicon-explorer";
import { getLetDoveItems } from "@/lib/letdove";

export const metadata = {
  title: "letdove knowledge base",
  description: "A shared reference library built for quick lookup across LetDove content cards."
};

export default function LetDovePage() {
  const items = getLetDoveItems();

  return (
    <LexiconExplorer items={items} />
  );
}
