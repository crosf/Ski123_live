# services/soap_client.py
import aiohttp

# Конфиг — поменяй SOAP_URL если нужно
SOAP_URL = "http://10.3.226.131/Info"
HEADERS = {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction": ""
}
TIMEOUT = 7

async def soap_call(session: aiohttp.ClientSession, action: str, body: str) -> str | None:
    headers = HEADERS.copy()
    headers["SOAPAction"] = action
    envelope = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        {body}
      </soap:Body>
    </soap:Envelope>"""
    try:
        async with session.post(SOAP_URL, data=envelope.encode("utf-8"), headers=headers, timeout=TIMEOUT) as resp:
            return await resp.text()
    except Exception as e:
        # Логирование минимальное — при необходимости расширим
        print("SOAP ERROR:", e)
        return None
