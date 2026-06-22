import { LexiconExplorer } from "@/components/lexicon-explorer";
import {
  getCategoryL1Options,
  getCategoryL2Options,
  getLetDoveItems,
  getSeriesOptions
} from "@/lib/letdove";

export const metadata = {
  title: "letdove knowledge base",
  description: "A shared reference library built for quick lookup across L1/L2 categories, tags, and LetDove code."
};

export default function LetDovePage() {
  const items = getLetDoveItems();

  return (
    <LexiconExplorer
      categoryL1Options={getCategoryL1Options()}
      categoryL2Options={getCategoryL2Options()}
      items={items}
      series={getSeriesOptions()}
    />
  );
}
