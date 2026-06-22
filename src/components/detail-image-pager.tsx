"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

type DetailImagePagerProps = {
  images: string[];
  title: string;
};

export function DetailImagePager({ images, title }: DetailImagePagerProps) {
  const [index, setIndex] = useState(0);

  function move(direction: -1 | 1) {
    setIndex((current) => Math.max(0, Math.min(images.length - 1, current + direction)));
  }

  return (
    <section className="detail-hero-media" aria-label={`${title} images`}>
      <img alt={`${title} ${index + 1}`} key={images[index]} src={images[index]} />
      {index > 0 && (
        <button
          aria-label="Previous detail image"
          className="media-arrow media-arrow-left detail-media-arrow"
          onClick={() => move(-1)}
          title="Previous image"
          type="button"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
      )}
      {index < images.length - 1 && (
        <button
          aria-label="Next detail image"
          className="media-arrow media-arrow-right detail-media-arrow"
          onClick={() => move(1)}
          title="Next image"
          type="button"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      )}
      {images.length > 1 && (
        <div className="media-dots detail-media-dots" aria-label="Detail image position">
          {images.map((image, imageIndex) => (
            <span data-active={imageIndex === index} key={image} />
          ))}
        </div>
      )}
    </section>
  );
}
