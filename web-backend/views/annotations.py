import json
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from main import app, database


@app.route("/api/annotations")
async def list_annotations(request):
    rows = await database.fetch_all(
        """SELECT id, name,
                  ST_AsGeoJSON(geofence)::json AS geofence,
                  ST_AsGeoJSON(label_point)::json AS label_point
           FROM object_annotations ORDER BY id"""
    )
    features = []
    for row in rows:
        if row["geofence"]:
            features.append({
                "type": "Feature",
                "geometry": row["geofence"],
                "properties": {
                    "id": row["id"],
                    "feature_type": "geofence",
                    "name": row["name"],
                },
            })
        if row["label_point"]:
            features.append({
                "type": "Feature",
                "geometry": row["label_point"],
                "properties": {
                    "id": row["id"],
                    "feature_type": "label",
                    "name": row["name"],
                },
            })
    return JSONResponse({"type": "FeatureCollection", "features": features})


@app.route("/api/annotation/{annotation_id:int}", methods=["GET"])
async def get_annotation(request):
    annotation_id = request.path_params["annotation_id"]
    row = await database.fetch_one(
        """SELECT id, name,
                  ST_AsGeoJSON(geofence)::json AS geofence,
                  ST_AsGeoJSON(label_point)::json AS label_point
           FROM object_annotations WHERE id = :id""",
        {"id": annotation_id},
    )
    if not row:
        raise HTTPException(404, "Not found")
    return JSONResponse({
        "id": row["id"],
        "name": row["name"],
        "geofence": row["geofence"],
        "label_point": row["label_point"],
    })


@app.route("/api/annotation", methods=["POST"])
async def save_annotation(request):
    body = await request.json()
    annotation_id = body.get("id")
    name = body.get("name", "")
    geofence = body.get("geofence")
    label_point = body.get("label_point")
    geofence_json = json.dumps(geofence) if geofence else None
    label_json = json.dumps(label_point) if label_point else None

    if annotation_id:
        await database.execute(
            """UPDATE object_annotations SET
                name = :name,
                geofence = CASE WHEN :geofence::text IS NOT NULL
                    THEN ST_SetSRID(ST_GeomFromGeoJSON(:geofence), 4326) ELSE geofence END,
                label_point = CASE WHEN :label_point::text IS NOT NULL
                    THEN ST_SetSRID(ST_GeomFromGeoJSON(:label_point), 4326) ELSE label_point END,
                updated_at = NOW()
               WHERE id = :id""",
            {"id": annotation_id, "name": name,
             "geofence": geofence_json, "label_point": label_json},
        )
        return JSONResponse({"id": annotation_id, "status": "updated"})
    else:
        row = await database.fetch_one(
            """INSERT INTO object_annotations (name, geofence, label_point)
               VALUES (:name,
                       CASE WHEN :geofence::text IS NOT NULL
                           THEN ST_SetSRID(ST_GeomFromGeoJSON(:geofence), 4326) ELSE NULL END,
                       CASE WHEN :label_point::text IS NOT NULL
                           THEN ST_SetSRID(ST_GeomFromGeoJSON(:label_point), 4326) ELSE NULL END)
               RETURNING id""",
            {"name": name, "geofence": geofence_json, "label_point": label_json},
        )
        return JSONResponse({"id": row["id"], "status": "created"})


@app.route("/api/annotation/{annotation_id:int}", methods=["DELETE"])
async def delete_annotation(request):
    annotation_id = request.path_params["annotation_id"]
    result = await database.fetch_one(
        "DELETE FROM object_annotations WHERE id = :id RETURNING id",
        {"id": annotation_id},
    )
    if not result:
        raise HTTPException(404, "Annotation not found")
    return JSONResponse({"status": "deleted"})
