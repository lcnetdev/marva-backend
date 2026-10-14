FROM python:3.14-alpine

# xsltproc runs marc2bibframe2; rdflib (pure Python) produces the JSON-LD
RUN apk add --no-cache libxslt \
 && pip install --no-cache-dir "rdflib>=7,<8"

WORKDIR /app
COPY lookup.py server.py ./

ENV PYTHONUNBUFFERED=1 \
    CIP_LOOKUP_PORT=8080 \
    CIP_LOOKUP_M2B_XSL=/opt/marc2bibframe2/xsl/marc2bibframe2.xsl

USER nobody
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ['CIP_LOOKUP_PORT'], timeout=4)"

CMD ["python", "server.py"]
