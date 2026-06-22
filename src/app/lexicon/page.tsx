import { LexiconExplorer } from "@/components/lexicon-explorer";
import {
  getCategoryL1Options,
  getCategoryL2Options,
  getLetDoveItems,
  getSeriesOptions
} from "@/lib/letdove";

export const metadata = {
  title: "letdove knowledge base",
  description: "Browse LetDove structured content cards by L1 category, L2 category, series, code, and tags."
};

export default function LexiconPage() {
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
