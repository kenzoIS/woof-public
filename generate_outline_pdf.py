import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def draw_header_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748b"))
        if self._pageNumber > 1:
            self.drawString(54, 753, "UNIVERSITY OF SANTO TOMAS | CICS — DEPARTMENT OF INFORMATION SYSTEMS")
            self.drawRightString(558, 753, "WOOF: Happy Tails Pet Cafe")
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.5)
            self.line(54, 745, 558, 745)
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        self.drawString(54, 33, "Chapters 4 & 5 Formal Outline — Capstone Project AY 2025–2026")
        self.drawRightString(558, 33, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()

def pdf(filename):
    doc = SimpleDocTemplate(
        filename, pagesize=letter,
        leftMargin=54, rightMargin=54, topMargin=50, bottomMargin=54
    )
    styles = getSampleStyleSheet()

    uni = ParagraphStyle('uni', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=9.5, leading=13, textColor=colors.HexColor('#0f172a'), alignment=1)
    sub = ParagraphStyle('sub', parent=styles['Normal'], fontName='Helvetica',
        fontSize=8, leading=11, textColor=colors.HexColor('#475569'), alignment=1)
    title = ParagraphStyle('title', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=11.5, leading=15, textColor=colors.HexColor('#0f172a'), alignment=1, spaceAfter=4)

    ch = ParagraphStyle('ch', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=10.5, leading=14, textColor=colors.HexColor('#0f172a'), spaceBefore=10, spaceAfter=3)
    l1 = ParagraphStyle('l1', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=9, leading=12, textColor=colors.HexColor('#1e293b'), leftIndent=12, spaceBefore=5, spaceAfter=2)
    l2 = ParagraphStyle('l2', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=8.5, leading=11.5, textColor=colors.HexColor('#334155'), leftIndent=24, spaceBefore=3, spaceAfter=1.5)
    l3 = ParagraphStyle('l3', parent=styles['Normal'], fontName='Helvetica',
        fontSize=8, leading=10.5, textColor=colors.HexColor('#475569'), leftIndent=36, spaceBefore=1, spaceAfter=1)

    s = []

    # Header
    s.append(Paragraph("UNIVERSITY OF SANTO TOMAS", uni))
    s.append(Paragraph("COLLEGE OF INFORMATION AND COMPUTING SCIENCES", uni))
    s.append(Paragraph("DEPARTMENT OF INFORMATION SYSTEMS | Academic Year 2025–2026", sub))
    s.append(Spacer(1, 5))
    s.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#0f172a"), spaceAfter=5))
    s.append(Paragraph("OUTLINE FOR CHAPTERS 4 AND 5", title))
    s.append(Paragraph("<font size=8.5 color='#64748b'>System: WOOF — Business Intelligence and Analytics Dashboard for Happy Tails Pet Cafe</font>", title))
    s.append(Spacer(1, 3))
    s.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=4))

    # --- Chapter 4 ---
    s.append(Paragraph("4.  Results and Discussions", ch))

    s.append(Paragraph("4.1.  Presentation of Results", l1))
    s.append(Paragraph("4.1.1.  Data Gathering and Integration", l2))
    s.append(Paragraph("4.1.2.  Data Preprocessing", l2))
    s.append(Paragraph("4.1.3.  Modeling of Thresholds and Algorithms", l2))

    s.append(Paragraph("4.2.  Descriptive Analytics", l1))

    s.append(Paragraph("4.2.1.  Cafe Descriptive Analytics", l2))
    s.append(Paragraph("4.2.1.1.  Cafe Revenue and Total Orders KPI Summary", l3))
    s.append(Paragraph("4.2.1.2.  Average Check Size per Order", l3))
    s.append(Paragraph("4.2.1.3.  Human vs. Pet Co-Attachment Index", l3))
    s.append(Paragraph("4.2.1.4.  Category Revenue Contribution (Beverages, Food, Pet Bakery)", l3))
    s.append(Paragraph("4.2.1.5.  Menu Item Performance (Quantity Sold, Category, Revenue)", l3))

    s.append(Paragraph("4.2.2.  Pet Services Descriptive Analytics", l2))
    s.append(Paragraph("4.2.2.1.  Services Revenue and Active Bookings KPI Summary", l3))
    s.append(Paragraph("4.2.2.2.  Average Booking Value per Service", l3))
    s.append(Paragraph("4.2.2.3.  Service Utilization Monitor (Demand Share by Service Type)", l3))
    s.append(Paragraph("4.2.2.4.  Weekly Booking Trend by Day of the Week", l3))

    s.append(Paragraph("4.2.3.  Retail Descriptive Analytics", l2))
    s.append(Paragraph("4.2.3.1.  Total Retail Revenue KPI Summary", l3))
    s.append(Paragraph("4.2.3.2.  Omnichannel Revenue Distribution (POS, Shopee, TikTok Shop, PetHub)", l3))
    s.append(Paragraph("4.2.3.3.  The Retail Profit Paradox — Net Profit Margin after Platform Commissions and COGS", l3))
    s.append(Paragraph("4.2.3.4.  Category Revenue Contribution by Product Category", l3))
    s.append(Paragraph("4.2.3.5.  Top-Selling Products by Revenue and Quantity Sold", l3))

    s.append(Paragraph("4.2.4.  Cross-Sector Behavioral Analytics (Behavioral Bridges)", l2))
    s.append(Paragraph("4.2.4.1.  Association Rule Mining Results (Support, Confidence, Lift)", l3))
    s.append(Paragraph("4.2.4.2.  In-Sector Bundle Associations", l3))
    s.append(Paragraph("4.2.4.3.  Cross-Sector Synergy Analysis (Cafe × Services × Retail)", l3))

    s.append(Paragraph("4.2.5.  Consolidated Executive Overview", l2))
    s.append(Paragraph("4.2.5.1.  Combined Revenue and Order Volume Across All Sectors", l3))
    s.append(Paragraph("4.2.5.2.  Sector Contribution Breakdown (Cafe vs. Services vs. Retail)", l3))

    s.append(Paragraph("4.3.  Predictive Analytics", l1))

    s.append(Paragraph("4.3.1.  Cafe Demand Forecasting (Prophet Model)", l2))
    s.append(Paragraph("4.3.1.1.  Model Architecture — Multiplicative Seasonality and Exogenous Regressors", l3))
    s.append(Paragraph("4.3.1.2.  90-5-5 Multi-Zone Forecast (Train / Validation / Forecast)", l3))
    s.append(Paragraph("4.3.1.3.  Forecast Accuracy Metrics (MASE, Accuracy, sMAPE)", l3))
    s.append(Paragraph("4.3.1.4.  Weather Overlay on Forecast Chart", l3))
    s.append(Paragraph("4.3.1.5.  Sales Simulator — Weather and Holiday What-If Scenarios", l3))
    s.append(Paragraph("4.3.1.6.  Quiet Period Detection and Happy Hour Engine", l3))

    s.append(Paragraph("4.3.2.  Pet Services Demand Forecasting (SARIMAX Model)", l2))
    s.append(Paragraph("4.3.2.1.  Model Architecture — Seasonal Differencing and Exogenous Regressors", l3))
    s.append(Paragraph("4.3.2.2.  90-5-5 Multi-Zone Forecast (Train / Validation / Forecast)", l3))
    s.append(Paragraph("4.3.2.3.  Forecast Accuracy Metrics (MASE, Accuracy, sMAPE)", l3))
    s.append(Paragraph("4.3.2.4.  Occupancy Risk Alerts from Forecast", l3))
    s.append(Paragraph("4.3.2.5.  Sales Simulator — Weather and Holiday What-If Scenarios", l3))

    s.append(Paragraph("4.3.3.  Retail Channel Demand Forecasting", l2))
    s.append(Paragraph("4.3.3.1.  Net Sales Forecast per Channel (Physical, Online)", l3))
    s.append(Paragraph("4.3.3.2.  Net Profit Forecast after Platform Commissions", l3))

    s.append(Paragraph("4.4.  Prescriptive Analytics", l1))

    s.append(Paragraph("4.4.1.  Autonomous Executive Recommendations (Prescriptive Intelligence)", l2))
    s.append(Paragraph("4.4.1.1.  Active Trigger Suggestions (High-Confidence Threshold ≥ 75%)", l3))
    s.append(Paragraph("4.4.1.2.  Suppressed Low-Confidence Suggestions", l3))
    s.append(Paragraph("4.4.1.3.  Accept or Dismiss Recommendation Workflow", l3))

    s.append(Paragraph("4.4.2.  Smart Narrative Business Reports", l2))
    s.append(Paragraph("4.4.2.1.  AI-Generated Sector Summary Reports (Cafe, Services, Retail)", l3))

    s.append(Paragraph("4.4.3.  Cross-Sector Bundle Strategies (Behavioral Bridges)", l2))
    s.append(Paragraph("4.4.3.1.  Time-Windowed Bundle Recommendations", l3))
    s.append(Paragraph("4.4.3.2.  Bundle Explanation — Lift and Confidence Rationale", l3))

    s.append(Paragraph("4.5.  User Acceptance Testing (UAT)", l1))
    s.append(Paragraph("4.5.1.  UAT Objectives and Testing Design", l2))
    s.append(Paragraph("4.5.2.  Participants and Evaluation Instruments", l2))
    s.append(Paragraph("4.5.3.  UAT Test Scenarios and Task Matrix", l2))
    s.append(Paragraph("4.5.4.  Quantitative Results and Qualitative Findings", l2))

    s.append(Paragraph("4.6.  Summary of Findings", l1))

    s.append(Spacer(1, 6))
    s.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=4))

    # --- Chapter 5 ---
    s.append(Paragraph("5.  Conclusion and Recommendations", ch))

    s.append(Paragraph("5.1.  Conclusions", l1))

    s.append(Paragraph("5.2.  Recommendations", l1))

    s.append(Paragraph("5.2.1.  Strategic and Operational Planning", l2))
    s.append(Paragraph("5.2.1.1.  Cafe Operations Strategy", l3))
    s.append(Paragraph("5.2.1.2.  Pet Services Scheduling and Capacity Strategy", l3))
    s.append(Paragraph("5.2.1.3.  Omnichannel Retail Strategy", l3))
    s.append(Paragraph("5.2.1.4.  Cross-Sector Bundling Strategy", l3))

    s.append(Paragraph("5.2.2.  System Enhancements", l2))
    s.append(Paragraph("5.2.3.  For Future Researchers", l2))

    doc.build(s, canvasmaker=NumberedCanvas)
    print(f"Done: {filename}")

if __name__ == "__main__":
    pdf(os.path.join(os.getcwd(), "WOOF_Chapters_4_and_5_Outline.pdf"))
