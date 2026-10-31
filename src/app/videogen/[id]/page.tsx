import { VideoJobEditor } from "@/components/videogen/VideoJobEditor";

export default async function VideoJobPage(props: PageProps<"/videogen/[id]">) {
  const { id } = await props.params;
  return <VideoJobEditor id={id} />;
}
