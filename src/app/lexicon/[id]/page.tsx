import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ShareActions } from "@/components/share-actions";
import { getItemImages, getLetDoveItem, getLetDoveItems } from "@/lib/letdove";

type DetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return getLetDoveItems().map((item) => ({
    id: item.id
  }));
}

export async function generateMetadata({ params }: DetailPageProps) {
  const { id } = await params;
  const item = getLetDoveItem(id);

  if (!item) {
    return {
      title: "Card not found | LetDove Library"
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

export default async function DetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const item = getLetDoveItem(id);

  if (!item) {
    notFound();
  }

  const images = getItemImages(item);

  return (
    <main className="detail-page">
      <Link className="detail-back" href="/lexicon/">
        Back to lexicon
      </Link>

      <article className="post-modal detail-post">
        <div className="post-media">
          <div className="detail-media-track">
            {images.map((image, index) => (
              <img alt={`${item.title} ${index + 1}`} key={image} src={image} />
            ))}
          </div>
        </div>

        <div className="post-panel">
          <header className="post-header">
            <div>
              <span className="post-code">{item.letdove_code}</span>
              <h1 className="post-title">{item.title}</h1>
            </div>
            <ShareActions id={item.letdove_code} iconOnly showOpen={false} />
          </header>

          <div className="post-scroll">
            <span className="created-note">Created {item.created_at}</span>
            <p className="post-description">{item.description}</p>

            <div className="taxonomy-line">
              <span>L1 {item.category_l1}</span>
              <span>/</span>
              <span>L2 {item.category_l2}</span>
              <span>·</span>
              <span>{item.series}</span>
            </div>

            <div className="block-list">
              {item.cards.map((card) => (
                <section className="block-item" key={card.label}>
                  <strong className="block-label">{card.label}</strong>
                  <p className="block-body">{card.body}</p>
                </section>
              ))}
            </div>

            <div className="tag-list" aria-label="Search tags">
              {item.tags.map((tag) => (
                <span className="tag-pill" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {item.links[0] && (
            <footer className="post-footer">
              <a className="chip" href={item.links[0].url} rel="noreferrer" target="_blank">
                {item.links[0].label}
                <ExternalLink aria-hidden="true" size={13} />
              </a>
            </footer>
          )}
        </div>
      </article>
    </main>
  );
}
