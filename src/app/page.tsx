import { LexiconExplorer } from "@/components/lexicon-explorer";
import {
  getCategoryL1Options,
  getCategoryL2Options,
  getLetDoveItems,
  getSeriesOptions
} from "@/lib/letdove";

export default function Home() {
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
