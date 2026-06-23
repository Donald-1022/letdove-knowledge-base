import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CopyableCode } from "@/components/copyable-code";
import { DetailImagePager } from "@/components/detail-image-pager";
import { ShareActions } from "@/components/share-actions";
import { getItemImages, getLetDoveItem, getLetDoveItems } from "@/lib/letdove";

type DetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return getLetDoveItems().map((item) => ({
    id: item.letdove_code
  }));
}

export async function generateMetadata({ params }: DetailPageProps) {
  const { id } = await params;
  const item = getLetDoveItem(id);

  if (!item) {
    return {
      title: "Card not found | letdove knowledge base"
    };
  }

  return {
    title: `${item.title} | letdove knowledge base`,
    description: item.description,
    openGraph: {
      title: item.title,
      description: item.description,
      images: getItemImages(item)
    }
  };
}

export default async function LetDoveDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const item = getLetDoveItem(id);

  if (!item) {
    notFound();
  }

  const images = getItemImages(item);

  return (
    <main className="detail-hero-page">
      <header className="detail-hero-top">
        <Link className="detail-back" href="/library/">
          Back to library
        </Link>
        <ShareActions id={item.letdove_code} iconOnly showOpen={false} />
      </header>

      <DetailImagePager images={images} title={item.title} />

      <article className="detail-copy">
        <div className="detail-title-row">
          <div>
            <h1>{item.title}</h1>
            <div className="detail-meta-stack">
              <CopyableCode code={item.letdove_code} />
              <span>Created {item.created_at}</span>
            </div>
          </div>
        </div>

        <p className="detail-description">{item.description}</p>

        <div className="detail-blocks">
          {(item.cards ?? []).map((card) => (
            <section className="detail-block" key={card.label}>
              <h2>{card.label}</h2>
              <p>{card.body}</p>
            </section>
          ))}
        </div>

        {item.links?.[0] && (
          <div className="detail-links">
            {item.links.map((link) => (
              <a className="chip" href={link.url} key={link.url} rel="noreferrer" target="_blank">
                {link.label}
                <ExternalLink aria-hidden="true" size={13} />
              </a>
            ))}
          </div>
        )}
      </article>
    </main>
  );
}
