import requests
import asyncio
import aiohttp

SKI123_URL = "http://10.3.226.131/Info"
VPS_URL = "http://89.208.105.93:5050/api/push"
SECRET_TOKEN = "MY_SECRET_TOKEN"

HEADERS = {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction": ""
}

async def soap_call(session, action, body):
    headers = HEADERS.copy()
    headers["SOAPAction"] = action

    envelope = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        {body}
      </soap:Body>
    </soap:Envelope>"""

    async with session.post(SKI123_URL, data=envelope.encode("utf-8"), headers=headers) as resp:
        return await resp.text()

async def main():
    async with aiohttp.ClientSession() as session:
        while True:
            xml = await soap_call(
                session,
                "http://tempuri.org/iInfoInterface/GetEventData",
                "<GetEventData xmlns='http://tempuri.org/'/>"
            )

            requests.post(
                VPS_URL,
                json={"event_xml": xml},
                headers={"Authorization": f"Bearer {SECRET_TOKEN}"}
            )

            print("Отправлено")

            await asyncio.sleep(3)

asyncio.run(main())
