// Real photos and sound files for scares, by ghost type. Files live in media/ (sources in media/SOURCES.md).
// A type with no entry (or files that fail to load) falls back to the canvas drawing and synthesized sound.
// img: one path or a list (a random one is shown each time), jpg/png/webp, shown full screen and color-graded.
// sound: mp3/ogg/wav, played as the image hits.
// raw: true skips the cold color grade, for photos whose own colors are the point.
// Types: pale, tall, drowned, crowd, owl, dog, snake, kuman
export const MEDIA = {
  pale:    { img: ["media/ghost-scream.webp", "media/ghost-scream.webp", "media/ghost-hair.webp", "media/ghost-hair.webp", "media/face-2.jpg", "media/face-13.jpg", "media/pale.jpg"] },
  drowned: { img: ["media/face-6.jpg", "media/face-9.jpg", "media/face-1.jpg"] },
  tall:    { img: "media/tall.jpg" },
  crowd:   { img: "media/crowd.jpg" },
  dog:     { img: "media/dog.jpg" },
  snake:   { img: "media/snake.jpg" },
  kuman:   { img: "media/kuman.webp", raw: true }
};
