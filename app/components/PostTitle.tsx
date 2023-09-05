import { useState } from "react";
import type { GooglePhotosAlbum } from "~/types";

interface PostTitleProps {
  album: GooglePhotosAlbum;
  index: number;
}

export const PostTitle = ({ album, index }: PostTitleProps) => {
  const [title, setTitle] = useState(album.title);

  return (
    <input
      type="text"
      name={`${index}.postTitle`}
      id={`${index}.postTitle`}
      value={title}
      onChange={e => setTitle(e.target.value)}
      style={{ width: "100%" }}
    ></input>
  );
};
