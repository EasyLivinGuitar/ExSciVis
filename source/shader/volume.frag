#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

#define USE_BACK_TO_FRONT 1

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

/*2.1 gradient*/
vec3
get_gradient(vec3 sampling_pos){
    float voxX = max_bounds.x / volume_dimensions.x;
    float voxY = max_bounds.y / volume_dimensions.y;
    float voxZ = max_bounds.z / volume_dimensions.z;

    float dx = get_sample_data(sampling_pos + vec3(voxX, 0.0, 0.0)) - get_sample_data(sampling_pos - vec3(voxX, 0.0, 0.0));
    float dy = get_sample_data(sampling_pos + vec3(0.0, voxY, 0.0)) - get_sample_data(sampling_pos - vec3(0.0, voxY, 0.0));
    float dz = get_sample_data(sampling_pos + vec3(0.0, 0.0, voxZ)) - get_sample_data(sampling_pos - vec3(0.0, 0.0, voxZ));

    return vec3(dx, dy, dz);
}

vec3
get_out_point(vec3 ray_entry_position, vec3 ray_increment){
    vec3 sampling_pos = ray_entry_position + ray_increment;
    bool inside_volume = true;

    while(inside_volume){
        sampling_pos += ray_increment;
        inside_volume = inside_volume_bounds(sampling_pos);
    }

    return sampling_pos - ray_increment;

}

vec3
shade(vec3 point, vec3 in_color){
    vec3 ambient_light = light_ambient_color;

    vec3 normal = normalize(get_gradient(point));
    vec3 light_vector = (vec4(normalize(point - light_position), 1.0) * Modelview).xyz;

    //Fancy disco skull
//    return light_vector;

    float diffuse_term = dot(normal, normalize(light_vector));

    vec3 diffuse_light = max(light_diffuse_color * diffuse_term, 0.0);

    vec3 view_vector = normalize(point - camera_location);
    vec3 halfway_vector = normalize(view_vector+light_vector);

    float specular_term = pow(max(dot(normal, halfway_vector), 0.0), light_ref_coef);
    vec3 specular_light = max(light_specular_color * specular_term, 0.0);


    return in_color * ambient_light + in_color * diffuse_light + specular_light;
}

float
correct_opacity(float in_opacity){
    return 1.0 - pow(1.0 - in_opacity, sampling_distance / sampling_distance_ref * 255);
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;



#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }
    dst = max_val;
#endif

#if TASK == 11
    vec4 avg_val = vec4(0.0, 0.0, 0.0, 0.0);
    int n = 0;

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while(inside_volume){
        // get sample
        float s = get_sample_data(sampling_pos);
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s,s));

        avg_val.r += color.r;
        avg_val.g += color.g;
        avg_val.b += color.b;
        avg_val.a += color.a;

        n++;
        // increment the ray sampling position
        sampling_pos += ray_increment;
        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }

    if (n > 0){
        avg_val.r /= n;
        avg_val.g /= n;
        avg_val.b /= n;
        avg_val.a /= n;
    }

    dst = avg_val;
#endif
    
#if TASK == 12 || TASK == 13
    vec3 intersection = vec3(0.0, 0.0, 0.0);
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
        float s = get_sample_data(sampling_pos);

        if(s > iso_value){
            dst = texture(transfer_texture, vec2(s, s));
            intersection = sampling_pos;



#if TASK == 13 // Binary Search
            float epsilon = 0.0001;
            float current_iso = 0.0;
            vec3 min_pos = sampling_pos - ray_increment;
            vec3 max_pos = sampling_pos;

            vec3 mid_pos = vec3(0.0, 0.0, 0.0);

            for(int i = 0; i < 20; i++){
                if(current_iso >= (iso_value - epsilon) && current_iso <= (iso_value + epsilon)){
                    dst = texture(transfer_texture, vec2(current_iso, current_iso));
                    intersection = mid_pos;
                    break;
                }

                mid_pos = (max_pos + min_pos) / 2.0;
                current_iso = get_sample_data(mid_pos);

                if(current_iso > iso_value){
                    mid_pos = max_pos;
                }
                else{
                    mid_pos = min_pos;
                }
            }

#endif
#if ENABLE_LIGHTNING == 1 // Add Shading
            dst = vec4(shade(intersection, dst.rgb), 1.0);
#if ENABLE_SHADOWING == 1 // Add Shadows
            vec3 light_vector = (vec4(normalize(intersection - light_position), 1.0) * Modelview).xyz;
            bool inside_volume_secondary = inside_volume_bounds(intersection);
            vec3 secondary_ray_increment = -light_vector * sampling_distance * 4;

            vec3 secondary_sampling_pos = intersection + secondary_ray_increment;

            while(inside_volume_secondary){
                float s = get_sample_data(secondary_sampling_pos);

                if(s > iso_value){
                    dst = vec4(0.1, 0.1, 0.1, 1.0);
                    break;
                }

                secondary_sampling_pos += secondary_ray_increment;

                inside_volume_secondary = inside_volume_bounds(secondary_sampling_pos);
            }
#endif
#endif
        break;
        }
            // increment the ray sampling position
            sampling_pos += ray_increment;
            // update the loop termination condition
            inside_volume = inside_volume_bounds(sampling_pos);

    }
#endif


#if TASK == 31
    vec3 intensity = vec3(0.0, 0.0, 0.0);
    //FRONT TO BACK
#if USE_BACK_TO_FRONT == 0
    float s = get_sample_data(sampling_pos);
    vec4 transfer_data = texture(transfer_texture, vec2(s, s));

    float transparency = 1.0;
    intensity = transfer_data.rgb * transfer_data.a;

    while (inside_volume)
    {
        s = get_sample_data(sampling_pos);
        transfer_data = texture(transfer_texture, vec2(s, s));

        float opacity = transfer_data.a;
        vec3 color = transfer_data.rgb;

#if ENABLE_LIGHTNING == 1 // Add Shading
        color *= 5.0 * shade(sampling_pos, color);
#endif

        vec3 current_intensity = color * opacity;
        float current_transparency = 1.0f - opacity;

#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
        opacity = correct_opacity(opacity);
        current_transparency = pow(current_transparency, sampling_distance / sampling_distance_ref * 255);
#endif
        transparency *= current_transparency;
        intensity += current_intensity * transparency;

        if(transparency < 0.001){
            break;
        }

        // increment the ray sampling position
        sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#else //BACK TO FRONT
    vec3 ray_out_point = get_out_point(ray_entry_position, ray_increment);

    sampling_pos = ray_out_point;

    while(inside_volume){
        float s = get_sample_data(sampling_pos);
        vec4 transfer_data = texture(transfer_texture, vec2(s,s));

        vec3 color = transfer_data.rgb;
        float opacity = transfer_data.a;

#if ENABLE_OPACITY_CORRECTION == 1
        opacity = correct_opacity(opacity);
#endif

#if ENABLE_LIGHTNING == 1 // Add Shading
        color *= 5.0 * shade(sampling_pos, color);
#endif

        intensity = color * opacity + intensity * (1.0 - opacity);

        sampling_pos -= ray_increment;
        inside_volume = inside_volume_bounds(sampling_pos);
    }

#endif
    dst = vec4(intensity, 1.0);
#endif 

    // return the calculated color value
    FragColor = dst;
}

