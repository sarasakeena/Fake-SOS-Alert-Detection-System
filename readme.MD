# 🚨 ResQ Shield — Fake SOS Alert Detection System

ResQ Shield is a real-time emergency monitoring system designed to detect and flag fake SOS alerts using behavioral analysis and anomaly detection techniques.

The system is inspired by real-world patterns derived from the Montgomery County 911 Calls dataset and simulates how an emergency operations center can intelligently filter genuine alerts from suspicious or malicious ones.

---

## 🧠 How It Works
1. The system models normal emergency behavior using patterns such as time distribution, location density, and alert frequency.
2. When an SOS alert is triggered, it extracts key features like:
   - Alert frequency
   - Location repetition
   - User trust level
3. The alert is processed through a three-layer detection pipeline:
   - Rule Engine (deterministic logic)
   - Statistical Anomaly Detection (Isolation Forest-inspired)
   - Behavioral Profiling (user history)
4. These scores are combined into a final anomaly score and classified as:
   - 🟢 Genuine
   - 🟡 Suspicious
   - 🔴 Fake

---

## ⚙️ Features

- 🚨 Interactive SOS trigger system
- 📊 Real-time operations dashboard
- 🧠 Multi-layer anomaly detection pipeline
- 📈 Live alert simulation and visualization
- 🎯 Behavior-based fake alert detection
- 🌙 Dark-themed Emergency Operations Center UI

---

## 📂 Dataset

This project is inspired by patterns from the Montgomery County 911 Calls dataset, which provides real-world emergency call distributions used to model normal behavior.

---

## 🚀 Tech Stack

- HTML, CSS, JavaScript
- Frontend-based simulation
- ML-inspired anomaly scoring logic

---

## ⚠️ Note

This is a prototype system built for demonstration and hackathon purposes. It uses a lightweight approximation of anomaly detection rather than a fully trained machine learning model.

---

## 🎯 Future Enhancements

- Integration with real-time backend APIs
- Deployment with live geolocation tracking
- Full Isolation Forest model implementation
- Map-based visualization of alerts
- Advanced evaluation metrics (precision, recall)

---

## 👩‍💻 Author

Developed as a hackathon project to explore intelligent emergency response systems.
