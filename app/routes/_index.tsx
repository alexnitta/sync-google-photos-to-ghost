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
      <button>Sign in with Google</button>
    </Form>
  );
}
