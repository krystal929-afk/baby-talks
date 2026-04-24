// Plays a base64 mp3 returned from the server.
export async function playBase64Mp3(base64: string): Promise<void> {
  const url = `data:audio/mpeg;base64,${base64}`;
  const audio = new Audio(url);
  await audio.play();
  return new Promise((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
  });
}
