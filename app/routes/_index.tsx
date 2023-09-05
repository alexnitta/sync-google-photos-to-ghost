import type { V2_MetaFunction } from "@remix-run/node";
import { Form } from "@remix-run/react";

export const meta: V2_MetaFunction = () => {
  return [
    { title: "Sync Google Photos to Ghost Blog" },
    {
      name: "description",
      content:
        "A tool that downloads images from Google Photos albums and uploads them to Ghost blog posts",
    },
  ];
};

export default function Index() {
  return (
    <Form action="/auth/google" method="post">
      <h1>Sync Google Photos Albums to Ghost Blog Posts</h1>
      <p>
        This application allows you to create blog posts in a Ghost blog from
        albums in your Google Photos Account.
      </p>
      <p>To get started, sign in to your Google account.</p>
      <button>Sign in with Google</button>
    </Form>
  );
}
