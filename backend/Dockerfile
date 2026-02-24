FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY QuantBacktesting.Api.csproj ./
RUN dotnet restore

COPY . ./
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Python runtime for strategy execution.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Isolate python deps in a virtual environment.
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir pandas numpy

COPY --from=build /app/publish ./

EXPOSE 5055

# Render provides PORT at runtime.
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-5055} dotnet QuantBacktesting.Api.dll"]
