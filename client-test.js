const deviceId = "cmnxjzu2w0002lu6kuoavlzz4";
const baseUrl = "http://localhost:4000";

async function checkState() {
  try {
    const res = await fetch(`${baseUrl}/api/client/devices/${deviceId}/state`);
    const data = await res.json();

    console.log(new Date().toISOString(), data.lockState, data.device?.status);

    if (data.lockState === "LOCKED") {
      console.log("Show lock screen");
    } else if (data.lockState === "UNLOCKED") {
      console.log("Hide lock screen / allow session");
    } else if (data.lockState === "MAINTENANCE") {
      console.log("Show maintenance screen");
    }
  } catch (err) {
    console.error("State check failed:", err.message);
  }
}

async function checkAnnouncements() {
  try {
    const res = await fetch(`${baseUrl}/api/client/devices/${deviceId}/announcements`);
    const data = await res.json();

    if (data.announcements?.length) {
      for (const a of data.announcements) {
        console.log(`ANNOUNCEMENT [${a.level}] ${a.title}: ${a.message}`);

        await fetch(
          `${baseUrl}/api/client/devices/${deviceId}/announcements/${a.deliveryId}/ack`,
          { method: "POST" }
        );
      }
    }
  } catch (err) {
    console.error("Announcement check failed:", err.message);
  }
}

async function loop() {
  await checkState();
  await checkAnnouncements();
}

setInterval(loop, 5000);
loop();