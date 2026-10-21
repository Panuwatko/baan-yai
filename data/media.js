// Ghost photos and sound files for jump scares, by ghost type. Files live in media/ (sources in media/SOURCES.md).
// img: one path or a list; a random one is shown each time, and a path listed twice comes up twice as often.
// The owner's generated ghosts (ghost-scream, ghost-hair) are the main faces, weighted to show most of the time.
// raw: true skips the cold color grade, for photos whose own colors are the point.
// sound: mp3/ogg/wav, played as the image hits (otherwise a synthesized scream).
// Types: pale, tall, drowned, crowd, kuman
const MAIN = ["media/ghost-scream.webp", "media/ghost-hair.webp"];
const main = times => Array.from({ length: times }, () => MAIN).flat();

export const MEDIA = {
  pale:    { img: [...main(3), "media/face-2.jpg", "media/face-13.jpg"] },
  drowned: { img: [...main(2), "media/face-6.jpg", "media/face-9.jpg", "media/face-1.jpg"] },
  tall:    { img: [...main(2), "media/tall.jpg"] },
  crowd:   { img: [...main(2), "media/crowd.jpg"] },
  kuman:   { img: "media/kuman.webp", raw: true }
};
