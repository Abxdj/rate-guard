import streamlit as st
import redis
import time
import json
from datetime import datetime

# Config
st.set_page_config(
    page_title="rate-guard dashboard",
    page_icon="🛡️",
    layout="wide"
)

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Header
st.title("🛡️ rate-guard — Live Dashboard")
st.caption("Real-time request monitoring across all rate limiting algorithms")

# Sidebar controls
st.sidebar.header("Controls")
refresh_rate = st.sidebar.slider("Refresh interval (seconds)", 1, 10, 2)
show_keys = st.sidebar.number_input("Max keys to display", 1, 50, 10)

# Fetch Redis data
def get_rate_limit_data():
    data = []
    
    # Scan for all rate limit keys
    patterns = ["rate:tb:*", "rate:sw:*", "rate:lb:*"]
    algo_names = {"tb": "Token Bucket", "sw": "Sliding Window", "lb": "Leaky Bucket"}
    
    for pattern in patterns:
        keys = r.keys(pattern)
        for key in keys[:show_keys]:
            algo_code = key.split(":")[1]
            identifier = key.split(":")[-1]
            algo_name = algo_names.get(algo_code, "Unknown")
            ttl = r.pttl(key)
            
            if algo_code == "sw":
                # Sliding window uses sorted set
                count = r.zcard(key)
                data.append({
                    "identifier": identifier,
                    "algorithm": algo_name,
                    "current_usage": count,
                    "ttl_ms": ttl
                })
            else:
                # Token bucket and leaky bucket use hash
                fields = r.hgetall(key)
                if fields:
                    tokens = float(fields.get("tokens", fields.get("queue", 0)))
                    data.append({
                        "identifier": identifier,
                        "algorithm": algo_name,
                        "current_usage": round(tokens, 2),
                        "ttl_ms": ttl
                    })
    
    return data

# Metrics row 
col1, col2, col3 = st.columns(3)

try:
    info = r.info()
    connected_clients = info.get("connected_clients", 0)
    used_memory = info.get("used_memory_human", "N/A")
    total_keys = r.dbsize()
    
    col1.metric("Redis Connected Clients", connected_clients)
    col2.metric("Memory Used", used_memory)
    col3.metric("Total Redis Keys", total_keys)
except:
    st.error("Cannot connect to Redis. Make sure Memurai is running.")
    st.stop()

st.divider()

# Live key table
st.subheader("Active Rate Limit Buckets")
st.caption(f"Last updated: {datetime.now().strftime('%H:%M:%S')} — auto-refreshes every {refresh_rate}s")

data = get_rate_limit_data()

if data:
    import pandas as pd
    df = pd.DataFrame(data)
    df.columns = ["Identifier", "Algorithm", "Current Usage", "TTL (ms)"]
    st.dataframe(df, use_container_width=True)
else:
    st.info("No active rate limit keys in Redis. Send some requests to see data here.")

st.divider()

# Algorithm info
st.subheader("Algorithm Comparison")
perf_data = {
    "Algorithm": ["Token Bucket", "Leaky Bucket", "Sliding Window"],
    "Avg Latency": ["10.13ms", "10.06ms", "12.19ms"],
    "Req/Sec": ["~4,744", "~4,751", "~3,936"],
    "Best For": ["Burst-tolerant APIs", "Smooth throughput", "Strict per-minute limits"],
}
import pandas as pd
st.table(pd.DataFrame(perf_data))

#  Auto refresh 
time.sleep(refresh_rate)
st.rerun()