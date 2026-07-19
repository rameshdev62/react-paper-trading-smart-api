import os
import sys
import json
import time
from urllib.parse import urlparse, parse_qs
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pyotp
import hashlib
import requests

# Load environment variables
USER_ID = os.getenv("SHOONYA_USER_ID") or os.getenv("USER_ID")
PASSWORD = os.getenv("SHOONYA_PASSWORD") or os.getenv("PASSWORD")
CLIENT_ID = os.getenv("SHOONYA_API_KEY") or os.getenv("CLIENT_ID")
SECRET_CODE = os.getenv("SHOONYA_API_SECRET") or os.getenv("SECRET_CODE")
TOTP_SECRET = os.getenv("SHOONYA_TOTP_SECRET")

if not all([USER_ID, PASSWORD, CLIENT_ID, SECRET_CODE, TOTP_SECRET]):
    print(json.dumps({"error": "Missing Shoonya environment variables in .env"}))
    sys.exit(1)

# Generate TOTP
try:
    totp = pyotp.TOTP(TOTP_SECRET.replace(" ", ""))
    otp = totp.now()
except Exception as e:
    print(json.dumps({"error": f"Invalid TOTP Secret: {e}"}))
    sys.exit(1)

# API-only login page URL
LOGIN_URL = f"https://api.shoonya.com/OAuthlogin/authorize/oauth?client_id={CLIENT_ID}"

def scan_network_for_code(driver):
    try:
        logs = driver.get_log("performance")
        for entry in logs:
            try:
                message = json.loads(entry["message"])["message"]
                if message.get("method") == "Network.requestWillBeSent":
                    url = message.get("params", {}).get("request", {}).get("url", "")
                    if "code=" in url:
                        parsed = urlparse(url)
                        code = parse_qs(parsed.query).get("code", [None])[0]
                        if code:
                            return code
            except Exception:
                continue
    except Exception:
        pass
    return None

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1920,1080")
options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

try:
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)
    driver.get(LOGIN_URL)
    time.sleep(2)

    wait.until(EC.presence_of_element_located((By.ID, "lgnusrid")))
    
    user_input = driver.find_element(By.ID, "lgnusrid")
    pwd_input = driver.find_element(By.ID, "lgnpwd")
    otp_input = driver.find_element(By.ID, "lgnotp")

    user_input.clear()
    user_input.send_keys(USER_ID)
    
    pwd_input.clear()
    pwd_input.send_keys(PASSWORD)

    otp_input.clear()
    otp_input.send_keys(otp)

    wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "lgnBtnClss"))).click()

    # Wait for redirect and extract auth_code
    start = time.time()
    auth_code = None
    while time.time() - start < 20:
        auth_code = scan_network_for_code(driver)
        if auth_code:
            break
        time.sleep(0.5)
    
    driver.quit()

    if not auth_code:
        print(json.dumps({"error": "Timeout waiting for auth code in redirect. Check your password and API credentials."}))
        sys.exit(1)

    # Exchange auth code for access token
    AcsTokURL = "https://api.shoonya.com/NorenWClientAPI/GenAcsTok"
    data_to_hash = (CLIENT_ID + SECRET_CODE + auth_code).encode("utf-8")
    app_verifier = hashlib.sha256(data_to_hash).hexdigest()

    values = {
        "code": auth_code,
        "checksum": app_verifier,
        "uid": USER_ID
    }

    payload = 'jData=' + json.dumps(values)
    res = requests.post(AcsTokURL, data=payload)
    resDict = json.loads(res.text)

    if "access_token" in resDict:
        session = {
            "accessToken": resDict['access_token'],
            "userId": resDict['USERID'],
            "refreshToken": resDict['refresh_token'] or "",
            "accountId": resDict['actid'],
            "susertoken": resDict['susertoken']
        }
        print(json.dumps({"success": True, "session": session}))
    else:
        print(json.dumps({"error": f"Token exchange failed: {resDict}"}))
        sys.exit(1)

except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
